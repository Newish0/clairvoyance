import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from enum import IntEnum
from typing import Any, Dict, Literal, Optional, TypeVar

from config import setup_logger
from lib import gtfs_realtime_pb2 as pb
from google.protobuf.message import Message

from models.gtfs_enums import (
    AlertCause,
    AlertEffect,
    AlertSeverityLevel,
    CongestionLevel,
    OccupancyStatus,
    StopTimeUpdateScheduleRelationship,
    TripDescriptorScheduleRelationship,
    VehicleStopStatus,
)
from models.gtfs_models import (
    Alert,
    EntitySelector,
    Position,
    ScheduledTripDocument,
    TimeRange,
    Translation,
    TripDescriptor,
    TripVehicleHistory,
    Vehicle,
)
from utils.datetime import as_utc
from utils.resources import DataSource, get_resource


UpdateResult = Literal["updated", "skipped", "error"]


@dataclass
class AccumulatedUpdateResult:
    updated: int
    skipped: int
    error: int

    def __str__(self):
        total = self.updated + self.skipped + self.error
        if total == 0:
            return "No items processed"

        parts = []
        if self.updated > 0:
            parts.append(f"{self.updated} updated")
        if self.skipped > 0:
            parts.append(f"{self.skipped} skipped")
        if self.error > 0:
            parts.append(f"{self.error} failed")

        return f"{total} total: " + ", ".join(parts)


@dataclass
class FeedProcessResult:
    trip_updates: AccumulatedUpdateResult = None
    vehicle_updates: AccumulatedUpdateResult = None
    alerts: AccumulatedUpdateResult = None

    def __post_init__(self):
        if self.trip_updates is None:
            self.trip_updates = AccumulatedUpdateResult(0, 0, 0)
        if self.vehicle_updates is None:
            self.vehicle_updates = AccumulatedUpdateResult(0, 0, 0)
        if self.alerts is None:
            self.alerts = AccumulatedUpdateResult(0, 0, 0)

    def __str__(self):
        lines = []
        lines.append("Feed Processing Summary")

        if (
            self.trip_updates.updated
            + self.trip_updates.skipped
            + self.trip_updates.error
            > 0
        ):
            lines.append(f"\tTrip Updates: {self.trip_updates}")

        if (
            self.vehicle_updates.updated
            + self.vehicle_updates.skipped
            + self.vehicle_updates.error
            > 0
        ):
            lines.append(f"\tVehicle Updates: {self.vehicle_updates}")

        if self.alerts.updated + self.alerts.skipped + self.alerts.error > 0:
            lines.append(f"\tAlerts: {self.alerts}")

        if len(lines) == 1:  # Only header
            lines.append("\tNo data processed")

        return "\n".join(lines)


FieldType = TypeVar("FieldType")

EnumType = TypeVar("EnumType", bound=IntEnum)


@dataclass
class ParsedStopTimeEvent:
    """
    Computes all fields give the partials from being conditionally required.
    See https://gtfs.org/documentation/realtime/reference/#message-stoptimeevent
    """

    delay: int
    time: int
    uncertainty: Optional[int]
    scheduled_time: Optional[datetime]


class RealtimeUpdaterService:
    """
    Service to fetch GTFS Realtime data, parse it, find corresponding
    scheduled trips in MongoDB, and update them with realtime information.
    """

    # Number of seconds after an alert is marked ended if it has not been updated
    alert_end_timeout: int

    def __init__(
        self,
        agency_id: str,
        request_timeout: int = 30,
        alert_end_timeout: int = 300,
        logger=setup_logger(__name__),
    ):
        """
        Initializes the RealtimeUpdaterService.

        Args:
            agency_id: The ID of the agency associated with the GTFS Realtime data.
            request_timeout: Timeout in seconds for fetching data from URLs.
        """
        self.agency_id = agency_id
        self.request_timeout = request_timeout
        self.logger = logger
        self.alert_end_timeout = alert_end_timeout

    @staticmethod
    def __accum_result(
        accum_results: AccumulatedUpdateResult, result: UpdateResult
    ) -> None:
        if result == "updated":
            accum_results.updated += 1
        elif result == "skipped":
            accum_results.skipped += 1
        elif result == "error":
            accum_results.error += 1

    async def process_realtime_feed(self, data_source: DataSource) -> FeedProcessResult:
        """
        Fetches, parses, and processes a GTFS Realtime feed.

        Args:
            data_source: URL string or local file Path object pointing to the
                         GTFS Realtime protobuf data.
        """

        feed_data = get_resource(data_source, self.request_timeout, self.logger)

        if not feed_data:
            self.logger.error(f"Failed to fetch or read {data_source}")
            return

        feed_message = pb.FeedMessage.FromString(feed_data)

        feed_timestamp = self.__get_feed_timestamp(feed_message)

        feed_result = FeedProcessResult()

        tasks = {
            "trip_updates": [],
            "vehicle_updates": [],
            "alerts": [],
        }
        for feed_entity in feed_message.entity:
            if feed_entity.HasField("trip_update"):
                tasks["trip_updates"].append(
                    self.__process_trip_update(feed_entity.trip_update, feed_timestamp)
                )
            if feed_entity.HasField("vehicle"):
                tasks["vehicle_updates"].append(
                    self.__process_vehicle_position(feed_entity.vehicle, feed_timestamp)
                )
            if feed_entity.HasField("alert"):
                tasks["alerts"].append(
                    self.__process_alert(
                        feed_entity.alert, feed_entity.id, feed_timestamp
                    )
                )

            # TODO: The shape and stop entities are not yet supported
            # if feed_entity.shape:
            #     self.__process_shape(feed_entity.shape)
            # if feed_entity.stop:
            #     self.__process_stop(feed_entity.stop)
            # if feed_entity.trip_modifications:
            #     self.__process_trip_modifications(feed_entity.trip_modifications)

        for task in tasks:
            results = await asyncio.gather(*tasks[task])
            for result in results:
                self.__accum_result(getattr(feed_result, task), result)

        return feed_result

    def __map_enum(
        self, src_enum_val: int | None, dst_enum: type[EnumType], default=None
    ) -> EnumType | None:
        """
        Maps a enum in protobuf to an IntEnum used in our DB.
        """
        if src_enum_val is None:
            return default
        try:
            return dst_enum(src_enum_val)
        except ValueError:
            return default

    @staticmethod
    def __get_field(
        message: Message | None,
        field_name: str,
        default: Optional[Any] = None,
    ) -> Any | None:
        """
        Gets a field from a protobuf message allow for a default value.
        """
        if message and message.HasField(field_name):
            return getattr(message, field_name)
        else:
            return default

    def __get_feed_timestamp(self, feed: pb.FeedMessage) -> datetime:
        """Gets the timestamp from the feed header or current time, ensuring UTC."""
        return self.__get_entity_timestamp(feed.header, datetime.now(tz=timezone.utc))

    def __get_entity_timestamp(self, entity: Message, default=None) -> datetime:
        """Gets timestamp from entity or defaults to given, ensuring UTC."""
        if entity.HasField("timestamp"):
            ts = entity.timestamp
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        else:
            return default

    async def __process_trip_update(
        self, trip_update: pb.TripUpdate, feed_timestamp: datetime
    ) -> UpdateResult:
        """Processes a trip update.

        Returns:
            UpdateResult: "updated", "skipped", or "error"
        """

        db_trip = await self.__find_scheduled_trip(trip_update.trip)

        if not db_trip:
            return "error"

        # For checking for changes before saving
        untouched_db_trip = db_trip.model_copy(deep=True)

        entity_timestamp = self.__get_entity_timestamp(trip_update, feed_timestamp)

        # Skip if already up to date. Assume DB stores dates in UTC
        if db_trip.stop_times_updated_at and entity_timestamp <= as_utc(
            db_trip.stop_times_updated_at
        ):
            return "skipped"

        db_trip.schedule_relationship = self.__map_enum(
            self.__get_field(trip_update.trip, "schedule_relationship"),
            TripDescriptorScheduleRelationship,
            db_trip.schedule_relationship,
        )

        pb_vehicle = self.__get_field(trip_update, "vehicle")
        pb_vehicle_id = self.__get_field(pb_vehicle, "id")
        if pb_vehicle_id:
            db_trip.vehicle = Vehicle(
                vehicle_id=pb_vehicle_id,
                label=self.__get_field(pb_vehicle, "label"),
                license_plate=self.__get_field(pb_vehicle, "license_plate"),
                wheelchair_accessible=self.__map_enum(
                    self.__get_field(pb_vehicle, "wheelchair_accessible"),
                    pb.VehicleDescriptor.WheelchairAccessible,
                ),
            )

        for stu in trip_update.stop_time_update:

            # Find the scheduled stop time info (for reference and delay calculation)
            db_st = next(
                (s for s in db_trip.stop_times if s.stop_sequence == stu.stop_sequence),
                None,
            )

            db_st.schedule_relationship = self.__map_enum(
                self.__get_field(stu, "schedule_relationship"),
                StopTimeUpdateScheduleRelationship,
                db_st.schedule_relationship,
            )

            # Skip if no data since StopTimeEvent requires this to be not NO_DATA
            if (
                db_st.schedule_relationship
                == StopTimeUpdateScheduleRelationship.NO_DATA
            ):
                continue

            if not db_st:
                self.logger.warning(
                    f"StopTimeUpdate for trip {db_trip.id} has unknown stop_sequence {stu.stop_sequence}. Skipping update."
                )
                # TODO: Consider stop times schedule relationship due to alternate routing
                continue  # Skip this specific stop time update

            if db_st.stop_id != stu.stop_id:
                # TODO: Consider stop times schedule relationship due to alternate routing
                self.logger.warning(
                    f"StopTimeUpdate for trip {db_trip.id} has mismatched stop_id {stu.stop_id} at stop_sequence {stu.stop_sequence}. Skipping update."
                )
                continue

            arrival_st_evt = self.__get_field(stu, "arrival")
            departure_st_evt = self.__get_field(stu, "departure")

            if arrival_st_evt:
                arrival_parsed = self.__parse_stop_time_event(
                    arrival_st_evt, db_st.arrival_datetime
                )
                db_st.arrival_delay = arrival_parsed.delay
                db_st.predicted_arrival_datetime = as_utc(arrival_parsed.time)
                db_st.predicted_arrival_uncertainty = arrival_parsed.uncertainty

            if departure_st_evt:
                departure_parsed = self.__parse_stop_time_event(
                    departure_st_evt, db_st.departure_datetime
                )
                db_st.departure_delay = departure_parsed.delay
                db_st.predicted_departure_datetime = as_utc(departure_parsed.time)
                db_st.predicted_departure_uncertainty = departure_parsed.uncertainty

        if db_trip == untouched_db_trip:
            return "skipped"

        db_trip.stop_times_updated_at = entity_timestamp
        try:
            await db_trip.save()
        except Exception as e:
            self.logger.error(
                f"Error updating scheduled trip {db_trip.id}: {e}", exc_info=True
            )
            return "error"

        self.logger.debug(f"Successfully updated trip {db_trip.id} from TripUpdate.")
        return "updated"

    async def __find_scheduled_trip(
        self, trip: pb.TripDescriptor
    ) -> Optional[ScheduledTripDocument]:
        """
        Finds the corresponding ScheduledTripDocument in MongoDB.
        Matches primarily on trip_id, start_date and start_time.
        """

        # Basic validation
        query = []
        if (
            trip.HasField("trip_id")
            and trip.HasField("start_date")
            and trip.HasField("start_time")
        ):
            core_trip_id = self.__extract_core_trip_id(trip.trip_id)
            query = [
                ScheduledTripDocument.trip_id == core_trip_id,
                ScheduledTripDocument.start_date == trip.start_date,
                ScheduledTripDocument.start_time == trip.start_time,
            ]
        elif (
            trip.HasField("route_id")
            and trip.HasField("direction_id")
            and trip.HasField("start_date")
            and trip.HasField("start_time")
        ):
            query = [
                ScheduledTripDocument.route_id == trip.route_id,
                ScheduledTripDocument.direction_id == trip.direction_id,
                ScheduledTripDocument.start_date == trip.start_date,
                ScheduledTripDocument.start_time == trip.start_time,
            ]
        else:
            self.logger.warning(
                "TripUpdate/VehiclePosition missing required fields. Cannot find scheduled trip."
            )
            return None

        try:
            db_trip = await ScheduledTripDocument.find_one(*query)
            if not db_trip:
                self.logger.debug(
                    f"No scheduled trip found for "
                    f"\t trip_id: {trip.trip_id}, "
                    f"\t route_id: {trip.route_id}, "
                    f"\t direction_id: {trip.direction_id}, "
                    f"\t start_date: {trip.start_date}, "
                    f"\t start_time: {trip.start_time}"
                )
            return db_trip
        except Exception as e:
            self.logger.error(
                f"Database error finding scheduled trip for "
                f"\t trip_id: {trip.trip_id}, "
                f"\t route_id: {trip.route_id}, "
                f"\t direction_id: {trip.direction_id}, "
                f"\t start_date: {trip.start_date}, "
                f"\t start_time: {trip.start_time}"
                f"with error: {e}",
                exc_info=True,
            )
            return None

    @staticmethod
    def __extract_core_trip_id(gtfs_rt_trip_id: str) -> str:
        """Extracts the core trip ID by removing potential update suffixes (like '#...')."""
        return gtfs_rt_trip_id.split("#")[0]

    @staticmethod
    def __parse_stop_time_event(
        st_evt: pb.TripUpdate.StopTimeEvent, scheduled_time: Optional[datetime]
    ) -> ParsedStopTimeEvent:
        """_summary_

        Args:
            st_evt (pb.TripUpdate.StopTimeEvent): _description_
            scheduled_time (Optional[datetime]): Must be provided if it exist in DB (i.e. this is not a Trip Update with schedule relationship NEW )

        Returns:
            ParsedStopTimeEvent: _description_
        """
        delay: int | None = RealtimeUpdaterService.__get_field(st_evt, "delay")
        time: int | None = RealtimeUpdaterService.__get_field(st_evt, "time")
        uncertainty = RealtimeUpdaterService.__get_field(st_evt, "uncertainty")

        # st_evt_scheduled_time = RealtimeUpdaterService.__get_field(
        #     st_evt, "scheduled_time"
        # )
        # scheduled_time = scheduled_time or st_evt_scheduled_time

        if delay is None and scheduled_time:
            delay = scheduled_time.timestamp() - time

        if time is None and scheduled_time:
            time = datetime.fromtimestamp(
                scheduled_time + timedelta(seconds=delay)
            ).timestamp()

        return ParsedStopTimeEvent(
            delay=delay,
            time=time,
            uncertainty=uncertainty,
            scheduled_time=None,
            # scheduled_time=st_evt_scheduled_time,
        )

    async def __process_vehicle_position(
        self, vehicle: pb.VehiclePosition, feed_timestamp: datetime
    ) -> UpdateResult:
        """Processes a VehiclePosition entity and updates the corresponding scheduled trip."""

        # Only process if the vehicle is associated with a trip
        if not vehicle.HasField("trip"):
            self.logger.debug(
                f"Skipping VehiclePosition for vehicle {vehicle.vehicle.id} as it's not assigned to a trip."
            )
            return "skipped"

        db_trip = await self.__find_scheduled_trip(vehicle.trip)
        if not db_trip:
            self.logger.debug(
                f"No scheduled trip found for VehiclePosition (vehicle: {vehicle.vehicle.id}, trip: {vehicle.trip.trip_id}). Skipping update."
            )
            return "skipped"

        untouched_db_trip = db_trip.model_copy(deep=True)

        entity_timestamp = self.__get_entity_timestamp(vehicle, feed_timestamp)

        # Skip if already up to date
        if db_trip.position_updated_at and entity_timestamp <= as_utc(
            db_trip.position_updated_at
        ):
            self.logger.debug(
                f"Skipping VehiclePosition for vehicle {vehicle.vehicle.id} as it's already up to date."
            )
            return "skipped"

        if vehicle.HasField("vehicle") and vehicle.vehicle.HasField("id"):
            db_trip.vehicle = Vehicle(
                vehicle_id=vehicle.vehicle.id,
                label=vehicle.vehicle.label,
                license_plate=vehicle.vehicle.license_plate,
                wheelchair_accessible=vehicle.vehicle.wheelchair_accessible,
            )

        db_trip.current_status = self.__map_enum(
            self.__get_field(vehicle, "current_status"),
            VehicleStopStatus,
            db_trip.current_status,
        )

        raw_stop_seq = self.__get_field(
            vehicle, "current_stop_sequence", db_trip.current_stop_sequence
        )
        db_trip.current_stop_sequence = (
            int(raw_stop_seq) if raw_stop_seq is not None else None
        )

        # MUST come BEFORE congestion & occupancy update to make a snapshot of those fields
        pos = self.__get_field(vehicle, "position")
        if pos:
            new_pos = Position(
                latitude=pos.latitude,
                longitude=pos.longitude,
                timestamp=entity_timestamp,
                bearing=self.__get_field(pos, "bearing"),
                speed=self.__get_field(pos, "speed"),
            )

            if db_trip.current_position != new_pos:
                # To simplify update, history is only updated when where is a new position
                # even when other tracked fields may have changed.
                if db_trip.current_position:
                    db_trip.history.append(
                        TripVehicleHistory(
                            congestion_level=db_trip.current_congestion,
                            occupancy_status=db_trip.current_occupancy,
                            position=db_trip.current_position,
                            timestamp=db_trip.position_updated_at or entity_timestamp,
                        )
                    )

                db_trip.current_position = new_pos

        db_trip.current_congestion = self.__map_enum(
            self.__get_field(vehicle, "congestion_level"),
            CongestionLevel,
            db_trip.current_congestion,
        )

        db_trip.current_occupancy = self.__map_enum(
            self.__get_field(vehicle, "occupancy_status"),
            OccupancyStatus,
            db_trip.current_occupancy,
        )

        # NOTE: We ignore updating schedule relationship here again b/c we assume
        #       that was already done in trip update.

        if db_trip == untouched_db_trip:
            self.logger.debug(
                f"Skipping VehiclePosition for vehicle {vehicle.vehicle.id} (trip: {db_trip.id}) as it's already up to date."
            )
            return "skipped"

        db_trip.position_updated_at = entity_timestamp
        try:
            await db_trip.save()
        except Exception as e:
            self.logger.error(
                f"Failed to update trip {db_trip.id} from VehiclePosition: {e}"
            )
            return "error"

        self.logger.debug(
            f"Successfully updated trip {db_trip.id} from VehiclePosition (Vehicle ID: {db_trip.vehicle.vehicle_id})."
        )

        return "updated"

    async def __process_alert(
        self, alert: pb.Alert, entity_id: str, feed_timestamp: datetime
    ) -> UpdateResult:
        """Processes an Alert entity and saves it to the database."""

        cause = self.__map_enum(
            self.__get_field(alert, "cause"), AlertCause, AlertCause.UNKNOWN_CAUSE
        )
        effect = self.__map_enum(
            self.__get_field(alert, "effect"), AlertEffect, AlertEffect.UNKNOWN_EFFECT
        )

        url_tls = getattr(self.__get_field(alert, "url"), "translations", [])
        url = [Translation(text=tl.text, language=tl.language) for tl in url_tls]

        header_text_tls = getattr(
            self.__get_field(alert, "header_text"), "translations", []
        )
        header_text = [
            Translation(text=tl.text, language=tl.language) for tl in header_text_tls
        ]

        description_text_tls = getattr(
            self.__get_field(alert, "description_text"), "translations", []
        )
        description_text = [
            Translation(text=tl.text, language=tl.language)
            for tl in description_text_tls
        ]

        severity_level = self.__map_enum(
            self.__get_field(alert, "severity_level"),
            AlertSeverityLevel,
            AlertSeverityLevel.UNKNOWN_SEVERITY,
        )

        active_periods = []
        if len(alert.active_period) > 0:
            active_periods = [
                TimeRange(
                    start=(as_utc(period.start) if period.start else None),
                    end=(as_utc(period.end) if period.end else None),
                )
                for period in alert.active_period
            ]

        informed_entities = []
        if len(alert.informed_entity) > 0:
            informed_entities = [
                EntitySelector(
                    agency_id=self.__get_field(entity, "agency_id"),
                    route_id=self.__get_field(entity, "route_id"),
                    route_type=self.__get_field(entity, "route_type"),
                    trip=(
                        TripDescriptor(
                            direction_id=self.__get_field(entity.trip, "direction_id"),
                            trip_id=self.__get_field(entity.trip, "trip_id"),
                            start_date=self.__get_field(entity.trip, "start_date"),
                            start_time=self.__get_field(entity.trip, "start_time"),
                            route_id=self.__get_field(entity.trip, "route_id"),
                        )
                        if entity.HasField("trip")
                        else None
                    ),
                    stop_id=self.__get_field(entity, "stop_id"),
                    direction_id=self.__get_field(entity, "direction_id"),
                )
                for entity in alert.informed_entity
            ]

        db_alert = await self.__find_alert(entity_id)

        if not db_alert:
            db_alert = Alert(
                producer_alert_id=entity_id,
                agency_id=self.agency_id,
                cause=cause,
                effect=effect,
                url=url,
                header_text=header_text,
                description_text=description_text,
                severity_level=severity_level,
                active_periods=active_periods,
                informed_entities=informed_entities,
                updated_at=feed_timestamp,
            )
        else:
            untouched_db_alert = db_alert.model_copy(deep=True)

            db_alert.cause = cause
            db_alert.effect = effect
            db_alert.url = url
            db_alert.header_text = header_text
            db_alert.description_text = description_text
            db_alert.severity_level = severity_level
            db_alert.active_periods = active_periods
            db_alert.informed_entities = informed_entities

            if untouched_db_alert == db_alert:
                self.logger.debug(
                    f"Skipping Alert {entity_id} as it's already up to date."
                )
                return "skipped"

            db_alert.updated_at = feed_timestamp

        try:
            await db_alert.save()
        except Exception as e:
            self.logger.error(f"Failed to save Alert: {e}", exc_info=True)
            return "error"

        self.logger.debug(f"Successfully saved Alert {entity_id}.")
        return "updated"

    async def __find_alert(self, alert_id: str) -> Optional[Alert]:
        return await Alert.find_one({"producer_alert_id": alert_id})

    async def mark_timed_out_alerts(self) -> int:
        current_time = datetime.now(tz=timezone.utc)
        timeout_threshold = current_time - timedelta(seconds=self.alert_end_timeout)

        # Update active_periods that don't have an end time for timed-out alerts
        result = await Alert.find_many(
            {
                "updated_at": {"$lt": timeout_threshold},
                "active_periods.end": None,
            }
        ).update_many(
            {
                "$set": {
                    "active_periods.$.end": current_time,
                }
            }
        )

        return result.modified_count
