import datetime
from typing import Dict, Optional, Set, Tuple, Union
from pathlib import Path
import pytz
import requests
from lib import gtfs_realtime_pb2 as pb
from google.protobuf.message import Message

from models import (
    TripDescriptorScheduleRelationship,
    OccupancyStatus,
    VehicleStopStatus,
)
from config import setup_logger
from models.gtfs_enums import (
    AlertCause,
    AlertEffect,
    AlertSeverityLevel,
    CongestionLevel,
    StopTimeUpdateScheduleRelationship,
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


# --- Type Aliases ---
DataSource = Union[str, Path]  # URL string or local file Path


class RealtimeUpdaterService:
    """
    Service to fetch GTFS Realtime data, parse it, find corresponding
    scheduled trips in MongoDB, and update them with realtime information.
    """

    def __init__(
        self, agency_id: str, request_timeout: int = 30, logger=setup_logger(__name__)
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

        # --- Mappings from Protobuf Enum Ints to Model Enums ---
        self._trip_schedule_relationship_map: Dict[
            int, TripDescriptorScheduleRelationship
        ] = {
            pb.TripDescriptor.SCHEDULED: TripDescriptorScheduleRelationship.SCHEDULED,
            pb.TripDescriptor.ADDED: TripDescriptorScheduleRelationship.ADDED,
            pb.TripDescriptor.UNSCHEDULED: TripDescriptorScheduleRelationship.UNSCHEDULED,
            pb.TripDescriptor.CANCELED: TripDescriptorScheduleRelationship.CANCELED,
            pb.TripDescriptor.DUPLICATED: TripDescriptorScheduleRelationship.DUPLICATED,
            pb.TripDescriptor.DELETED: TripDescriptorScheduleRelationship.DELETED,
        }

        self._stop_time_schedule_relationship_map: Dict[
            int,
            StopTimeUpdateScheduleRelationship,
        ] = {
            pb.TripUpdate.StopTimeUpdate.SCHEDULED: StopTimeUpdateScheduleRelationship.SCHEDULED,
            pb.TripUpdate.StopTimeUpdate.SKIPPED: StopTimeUpdateScheduleRelationship.SKIPPED,
            pb.TripUpdate.StopTimeUpdate.NO_DATA: StopTimeUpdateScheduleRelationship.NO_DATA,
            pb.TripUpdate.StopTimeUpdate.UNSCHEDULED: StopTimeUpdateScheduleRelationship.UNSCHEDULED,
        }

        self._occupancy_status_map: Dict[int, OccupancyStatus] = {
            pb.VehiclePosition.EMPTY: OccupancyStatus.EMPTY,
            pb.VehiclePosition.MANY_SEATS_AVAILABLE: OccupancyStatus.MANY_SEATS_AVAILABLE,
            pb.VehiclePosition.FEW_SEATS_AVAILABLE: OccupancyStatus.FEW_SEATS_AVAILABLE,
            pb.VehiclePosition.STANDING_ROOM_ONLY: OccupancyStatus.STANDING_ROOM_ONLY,
            pb.VehiclePosition.CRUSHED_STANDING_ROOM_ONLY: OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY,
            pb.VehiclePosition.FULL: OccupancyStatus.FULL,
            pb.VehiclePosition.NOT_ACCEPTING_PASSENGERS: OccupancyStatus.NOT_ACCEPTING_PASSENGERS,
            pb.VehiclePosition.NO_DATA_AVAILABLE: OccupancyStatus.NO_DATA_AVAILABLE,
            pb.VehiclePosition.NOT_BOARDABLE: OccupancyStatus.NOT_BOARDABLE,
        }

        self._vehicle_stop_status_map: Dict[int, VehicleStopStatus] = {
            pb.VehiclePosition.INCOMING_AT: VehicleStopStatus.INCOMING_AT,
            pb.VehiclePosition.STOPPED_AT: VehicleStopStatus.STOPPED_AT,
            pb.VehiclePosition.IN_TRANSIT_TO: VehicleStopStatus.IN_TRANSIT_TO,
        }

        self._congestion_level_map: Dict[int, int] = {
            pb.VehiclePosition.UNKNOWN_CONGESTION_LEVEL: CongestionLevel.UNKNOWN_CONGESTION_LEVEL,
            pb.VehiclePosition.RUNNING_SMOOTHLY: CongestionLevel.RUNNING_SMOOTHLY,
            pb.VehiclePosition.STOP_AND_GO: CongestionLevel.STOP_AND_GO,
            pb.VehiclePosition.CONGESTION: CongestionLevel.CONGESTION,
            pb.VehiclePosition.SEVERE_CONGESTION: CongestionLevel.SEVERE_CONGESTION,
        }

        self._alert_severity_level_map: Dict[int, AlertSeverityLevel] = {
            pb.Alert.SeverityLevel.UNKNOWN_SEVERITY: AlertSeverityLevel.UNKNOWN_SEVERITY,
            pb.Alert.SeverityLevel.INFO: AlertSeverityLevel.INFO,
            pb.Alert.SeverityLevel.WARNING: AlertSeverityLevel.WARNING,
            pb.Alert.SeverityLevel.SEVERE: AlertSeverityLevel.SEVERE,
        }

        self._alert_cause_map: Dict[int, AlertCause] = {
            pb.Alert.Cause.UNKNOWN_CAUSE: AlertCause.UNKNOWN_CAUSE,
            pb.Alert.Cause.OTHER_CAUSE: AlertCause.OTHER_CAUSE,
            pb.Alert.Cause.TECHNICAL_PROBLEM: AlertCause.TECHNICAL_PROBLEM,
            pb.Alert.Cause.STRIKE: AlertCause.STRIKE,
            pb.Alert.Cause.DEMONSTRATION: AlertCause.DEMONSTRATION,
            pb.Alert.Cause.ACCIDENT: AlertCause.ACCIDENT,
            pb.Alert.Cause.HOLIDAY: AlertCause.HOLIDAY,
            pb.Alert.Cause.WEATHER: AlertCause.WEATHER,
            pb.Alert.Cause.MAINTENANCE: AlertCause.MAINTENANCE,
            pb.Alert.Cause.CONSTRUCTION: AlertCause.CONSTRUCTION,
            pb.Alert.Cause.POLICE_ACTIVITY: AlertCause.POLICE_ACTIVITY,
            pb.Alert.Cause.MEDICAL_EMERGENCY: AlertCause.MEDICAL_EMERGENCY,
        }
        self._alert_effect_map: Dict[int, AlertEffect] = {
            pb.Alert.Effect.NO_SERVICE: AlertEffect.NO_SERVICE,
            pb.Alert.Effect.REDUCED_SERVICE: AlertEffect.REDUCED_SERVICE,
            pb.Alert.Effect.SIGNIFICANT_DELAYS: AlertEffect.SIGNIFICANT_DELAYS,
            pb.Alert.Effect.DETOUR: AlertEffect.DETOUR,
            pb.Alert.Effect.ADDITIONAL_SERVICE: AlertEffect.ADDITIONAL_SERVICE,
            pb.Alert.Effect.MODIFIED_SERVICE: AlertEffect.MODIFIED_SERVICE,
            pb.Alert.Effect.OTHER_EFFECT: AlertEffect.OTHER_EFFECT,
            pb.Alert.Effect.UNKNOWN_EFFECT: AlertEffect.UNKNOWN_EFFECT,
            pb.Alert.Effect.STOP_MOVED: AlertEffect.STOP_MOVED,
            pb.Alert.Effect.NO_EFFECT: AlertEffect.NO_EFFECT,
            pb.Alert.Effect.ACCESSIBILITY_ISSUE: AlertEffect.ACCESSIBILITY_ISSUE,
        }

    async def process_realtime_feed(
        self, data_source: DataSource
    ) -> Tuple[int, int, int]:
        """
        Fetches, parses, and processes a GTFS Realtime feed.

        Args:
            data_source: URL string or local file Path object pointing to the
                         GTFS Realtime protobuf data.

        Returns:
            A tuple containing:
            (processed_trip_updates, processed_vehicle_positions, total_entities_processed)
        """
        processed_trip_updates = 0
        processed_vehicle_updates = 0
        processed_alerts = 0
        total_entities = 0

        try:
            feed_content = self._fetch_feed_content(data_source)
            if not feed_content:
                return 0, 0, 0

            feed = self._parse_feed_message(feed_content)
            if not feed:
                return 0, 0, 0

            feed_timestamp_utc = self._get_feed_timestamp(feed)
            total_entities = len(feed.entity)

            processed_alert_ids = set()

            for entity in feed.entity:

                # print("-" * 20)
                # print("entity", entity)
                # return
                # print("-" * 20)

                if entity.HasField("trip_update"):
                    if await self._process_trip_update(
                        entity.trip_update, feed_timestamp_utc
                    ):
                        processed_trip_updates += 1

                if entity.HasField("vehicle"):
                    if await self._process_vehicle_position(
                        entity.vehicle, feed_timestamp_utc
                    ):
                        processed_vehicle_updates += 1

                if entity.HasField("alert"):
                    alert_id = entity.id
                    if alert_id:
                        if await self._process_alert(
                            alert_id, entity.alert, feed_timestamp_utc
                        ):
                            processed_alerts += 1
                            processed_alert_ids.add(alert_id)
                    else:
                        self.logger.warning(f"Skipping Alert entity with no ID.")

            if len(processed_alert_ids):
                await self._end_missing_alerts(processed_alert_ids, feed_timestamp_utc)

            self.logger.info(
                f"Processed {processed_trip_updates} trip updates, "
                f"{processed_vehicle_updates} vehicle updates, "
                f"{processed_alerts} alerts, out of "
                f"{total_entities} entities from {data_source}"
            )

        except Exception as e:
            self.logger.error(
                f"Failed to process feed from {data_source}: {e}", exc_info=True
            )

        return processed_trip_updates, processed_vehicle_updates, total_entities

    def _fetch_feed_content(self, data_source: DataSource) -> Optional[bytes]:
        """Fetches GTFS Realtime data from URL or reads from file."""
        self.logger.info(f"Fetching realtime data from: {data_source}")
        try:
            if isinstance(data_source, Path):
                if not data_source.is_file():
                    self.logger.error(f"File not found: {data_source}")
                    return None
                return data_source.read_bytes()
            elif isinstance(data_source, str) and (
                data_source.startswith("http://") or data_source.startswith("https://")
            ):
                response = requests.get(data_source, timeout=self.request_timeout)
                response.raise_for_status()  # Raises HTTPError for bad responses (4xx or 5xx)
                return response.content
            else:  # Assume it's a file path string
                path = Path(data_source)
                if not path.is_file():
                    self.logger.error(f"File not found: {data_source}")
                    return None
                return path.read_bytes()
        except requests.RequestException as e:
            self.logger.error(f"HTTP error fetching {data_source}: {e}")
            return None
        except IOError as e:
            self.logger.error(f"File I/O error reading {data_source}: {e}")
            return None
        except Exception as e:
            self.logger.error(f"Unexpected error fetching/reading {data_source}: {e}")
            return None

    def _parse_feed_message(self, content: bytes) -> Optional[pb.FeedMessage]:
        """Parses protobuf content into a FeedMessage object."""
        try:
            feed = pb.FeedMessage()
            feed.ParseFromString(content)
            self.logger.debug("Successfully parsed GTFS Realtime feed.")
            return feed
        except Exception as e:
            self.logger.error(f"Failed to parse protobuf feed: {e}")
            return None

    def _get_feed_timestamp(self, feed: pb.FeedMessage) -> datetime.datetime:
        """Gets the timestamp from the feed header or current time, ensuring UTC."""
        if feed.header.HasField("timestamp"):
            ts = feed.header.timestamp
            # Assume timestamp is Unix epoch
            return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
        else:
            # Fallback to current time if header timestamp is missing
            self.logger.warning("Feed header missing timestamp, using current time.")
            return datetime.datetime.now(pytz.utc)

    @staticmethod
    def _extract_core_trip_id(gtfs_rt_trip_id: str) -> str:
        """Extracts the core trip ID by removing potential update suffixes (like '#...')."""
        return gtfs_rt_trip_id.split("#")[0]

    async def _find_scheduled_trip(
        self, trip_descriptor: pb.TripDescriptor
    ) -> Optional[ScheduledTripDocument]:
        """
        Finds the corresponding ScheduledTripDocument in MongoDB.
        Matches primarily on trip_id and start_date.
        """
        if not trip_descriptor.HasField("trip_id"):
            self.logger.warning(
                "TripUpdate/VehiclePosition missing trip_id. Cannot find scheduled trip."
            )
            return None

        core_trip_id = self._extract_core_trip_id(trip_descriptor.trip_id)

        # GTFS Realtime start_date is YYYYMMDD format
        start_date_str = (
            trip_descriptor.start_date
            if trip_descriptor.HasField("start_date")
            else None
        )

        if not start_date_str:
            # This is problematic. Without a start date, matching trip_id alone is ambiguous
            # if the same trip_id runs on multiple days.
            # Option 1: Log a warning and skip.
            # Option 2: Try to infer based on current time (less reliable).
            # Option 3: If the DB stores *only* currently active trips, maybe query only by trip_id.
            # For now, we use Option 1 as it's safer.
            self.logger.warning(
                f"TripUpdate/VehiclePosition for trip_id '{core_trip_id}' missing start_date. Skipping."
            )
            return None

        try:
            trip = await ScheduledTripDocument.find_one(
                ScheduledTripDocument.trip_id == core_trip_id,
                ScheduledTripDocument.start_date == start_date_str,
            )
            if not trip:
                self.logger.debug(
                    f"No scheduled trip found for trip_id={core_trip_id}, start_date={start_date_str}"
                )
            return trip  # Returns the document or None
        except Exception as e:
            self.logger.error(
                f"Database error finding scheduled trip for {core_trip_id} on {start_date_str}: {e}",
                exc_info=True,
            )
            return None

    async def _process_trip_update(
        self,
        trip_update: pb.TripUpdate,
        feed_timestamp_utc: datetime.datetime,
    ) -> bool:
        """Processes a TripUpdate entity and updates the corresponding scheduled trip."""
        scheduled_trip = await self._find_scheduled_trip(trip_update.trip)
        if not scheduled_trip:
            return False

        original_scheduled_trip = scheduled_trip.copy(deep=True)

        update_timestamp_utc = self._get_entity_timestamp(
            trip_update, feed_timestamp_utc
        )
        last_updated_at_utc = (
            pytz.utc.localize(scheduled_trip.stop_times_updated_at)
            if scheduled_trip.stop_times_updated_at
            else None
        )

        # Skip if already up to date
        if last_updated_at_utc and update_timestamp_utc <= last_updated_at_utc:

            return False

        # --- Update Trip-Level Information ---
        if trip_update.trip.HasField("schedule_relationship"):
            new_trip_schedule_rel = self._trip_schedule_relationship_map.get(
                trip_update.trip.schedule_relationship,
                TripDescriptorScheduleRelationship.SCHEDULED,  # Default if unknown
            )
            if scheduled_trip.schedule_relationship != new_trip_schedule_rel:
                scheduled_trip.schedule_relationship = new_trip_schedule_rel

        if trip_update.HasField("vehicle") and trip_update.vehicle.HasField("id"):
            vehicle_id = trip_update.vehicle.id
            if (
                not scheduled_trip.vehicle
                or scheduled_trip.vehicle.vehicle_id != vehicle_id
            ):
                scheduled_trip.vehicle = Vehicle(
                    vehicle_id=vehicle_id,
                    label=trip_update.vehicle.label,
                    license_plate=trip_update.vehicle.license_plate,
                    wheelchair_accessible=trip_update.vehicle.wheelchair_accessible,
                )

        # --- Process Stop Time Updates ---
        for stu in trip_update.stop_time_update:
            stop_sequence = stu.stop_sequence  # Required field
            stop_id = stu.stop_id

            # Find the scheduled stop time info (for reference and delay calculation)
            scheduled_stop = next(
                (
                    s
                    for s in scheduled_trip.stop_times
                    if s.stop_sequence == stop_sequence
                ),
                None,
            )

            if not scheduled_stop:
                self.logger.warning(
                    f"StopTimeUpdate for trip {scheduled_trip.trip_id} has unknown stop_sequence {stop_sequence}. Skipping update."
                )
                # TODO: Consider stop times schedule relationship due to alternate routing
                continue  # Skip this specific stop time update

            if scheduled_stop.stop_id != stop_id:
                # TODO: Consider stop times schedule relationship due to alternate routing
                self.logger.warning(
                    f"StopTimeUpdate for trip {scheduled_trip.trip_id} has mismatched stop_id {stop_id} at stop_sequence {stop_sequence}. Skipping update."
                )
                continue

            # Update fields within the RealtimeStopTimeUpdate
            predicted_arrival_datetime = None
            predicted_departure_datetime = None
            arrival_delay = None
            departure_delay = None
            predicted_arrival_uncertainty = None
            predicted_departure_uncertainty = None
            schedule_relationship = scheduled_stop.schedule_relationship
            if stu.HasField("arrival"):
                arrival_delay = stu.arrival.delay
                predicted_arrival_datetime = datetime.datetime.fromtimestamp(
                    stu.arrival.time, tz=datetime.timezone.utc
                )
                if stu.arrival.HasField("uncertainty"):
                    predicted_arrival_uncertainty = stu.arrival.uncertainty
            if stu.HasField("departure"):
                departure_delay = stu.departure.delay
                predicted_departure_datetime = datetime.datetime.fromtimestamp(
                    stu.departure.time,
                    tz=datetime.timezone.utc,
                )
                if stu.departure.HasField("uncertainty"):
                    predicted_departure_uncertainty = stu.departure.uncertainty

            if stu.HasField("schedule_relationship"):
                schedule_relationship = self._stop_time_schedule_relationship_map.get(
                    stu.schedule_relationship,
                    scheduled_stop.schedule_relationship,  # Use existing if unknown
                )

            # Update the stop time info
            scheduled_stop.predicted_arrival_datetime = predicted_arrival_datetime
            scheduled_stop.predicted_departure_datetime = predicted_departure_datetime
            scheduled_stop.arrival_delay = arrival_delay
            scheduled_stop.departure_delay = departure_delay
            scheduled_stop.predicted_arrival_uncertainty = predicted_arrival_uncertainty
            scheduled_stop.predicted_departure_uncertainty = (
                predicted_departure_uncertainty
            )
            scheduled_stop.schedule_relationship = schedule_relationship

            # scheduled_stop_index = scheduled_trip.stop_times.index(scheduled_stop)
            # scheduled_trip.stop_times[scheduled_stop_index] = scheduled_stop

        if not original_scheduled_trip == scheduled_trip:
            # --- Update Timestamp and Save ---
            scheduled_trip.stop_times_updated_at = update_timestamp_utc
            try:
                await scheduled_trip.save()
                self.logger.debug(
                    f"Successfully updated trip {scheduled_trip.trip_id} from TripUpdate."
                )
                return True
            except Exception as e:
                self.logger.error(
                    f"Failed to save updated trip {scheduled_trip.trip_id}: {e}",
                    exc_info=True,
                )
                return False
        else:
            self.logger.debug(
                f"No relevant changes detected for trip {scheduled_trip.trip_id} from TripUpdate."
            )
            return True  # No error, just no changes needed saving

    async def _process_vehicle_position(
        self,
        vehicle: pb.VehiclePosition,
        feed_timestamp_utc: datetime.datetime,
    ) -> bool:
        """Processes a VehiclePosition entity and updates the corresponding scheduled trip."""

        # Only process if the vehicle is associated with a trip
        if not vehicle.HasField("trip"):
            self.logger.debug(
                f"Skipping VehiclePosition for vehicle {vehicle.vehicle.id} as it's not assigned to a trip."
            )
            return False

        scheduled_trip = await self._find_scheduled_trip(vehicle.trip)
        if not scheduled_trip:
            # This might be expected if a vehicle finishes a trip but still reports position briefly
            self.logger.debug(
                f"No scheduled trip found for VehiclePosition (vehicle: {vehicle.vehicle.id}, trip: {vehicle.trip.trip_id}). Skipping update."
            )
            return False

        original_scheduled_trip = scheduled_trip.copy(deep=True)

        update_timestamp_utc = self._get_entity_timestamp(vehicle, feed_timestamp_utc)

        last_updated_at_utc = (
            pytz.utc.localize(scheduled_trip.position_updated_at)
            if scheduled_trip.position_updated_at
            else None
        )

        # Skip if already up to date
        if last_updated_at_utc and last_updated_at_utc >= update_timestamp_utc:

            self.logger.debug(
                f"Skipping VehiclePosition for vehicle {vehicle.vehicle.id} as it's already up to date."
            )
            return False

        # --- Update Vehicle ID ---
        if vehicle.HasField("vehicle") and vehicle.vehicle.HasField("id"):
            scheduled_trip.vehicle = Vehicle(
                vehicle_id=vehicle.vehicle.id,
                label=vehicle.vehicle.label,
                license_plate=vehicle.vehicle.license_plate,
                wheelchair_accessible=vehicle.vehicle.wheelchair_accessible,
            )

        # --- Update Status ---
        if vehicle.HasField("current_status"):
            scheduled_trip.current_status = self._vehicle_stop_status_map.get(
                vehicle.current_status
            )

        if vehicle.HasField("current_stop_sequence"):
            scheduled_trip.current_stop_sequence = int(vehicle.current_stop_sequence)

        # --- Update Position ---
        if vehicle.HasField("position"):
            pos = vehicle.position
            new_position = Position(
                latitude=pos.latitude,
                longitude=pos.longitude,
                timestamp=update_timestamp_utc,  # Use entity timestamp for position
                bearing=pos.bearing if pos.HasField("bearing") else None,
                speed=pos.speed if pos.HasField("speed") else None,
            )

            if scheduled_trip.current_position != new_position:
                old_position = scheduled_trip.current_position
                scheduled_trip.current_position = new_position

                # To simplify update, history is only updated when where is a new position
                # even when other tracked fields may have changed.
                if old_position:
                    history = TripVehicleHistory(
                        congestion_level=scheduled_trip.current_congestion,
                        occupancy_status=scheduled_trip.current_occupancy,
                        position=old_position,
                        timestamp=last_updated_at_utc or update_timestamp_utc,
                    )
                    scheduled_trip.history.append(history)

        # MUST come AFTER position update since make a snapshot of occupancy status
        if vehicle.HasField("occupancy_status"):
            scheduled_trip.current_occupancy = self._occupancy_status_map.get(
                vehicle.occupancy_status
            )

        # MUST come AFTER position update since make a snapshot of congestion level
        if vehicle.HasField("congestion_level"):
            scheduled_trip.current_congestion = self._congestion_level_map.get(
                vehicle.congestion_level
            )

        if vehicle.trip.HasField("schedule_relationship"):
            scheduled_trip.schedule_relationship = (
                self._trip_schedule_relationship_map.get(
                    vehicle.trip.schedule_relationship,
                    scheduled_trip.schedule_relationship,
                )
            )

        if original_scheduled_trip == scheduled_trip:
            self.logger.debug(
                f"No relevant changes detected for trip {scheduled_trip.trip_id} from VehiclePosition (Vehicle ID: {scheduled_trip.vehicle.vehicle_id})."
            )
            return False

        scheduled_trip.position_updated_at = update_timestamp_utc
        try:
            await scheduled_trip.save()
            self.logger.debug(
                f"Successfully updated trip {scheduled_trip.trip_id} from VehiclePosition (Vehicle ID: {scheduled_trip.vehicle.vehicle_id})."
            )
            return True
        except Exception as e:
            self.logger.error(
                f"Failed to save updated trip {scheduled_trip.trip_id} from VehiclePosition: {e}",
                exc_info=True,
            )
            return False

    async def _process_alert(
        self, alert_id: str, alert: pb.Alert, feed_timestamp_utc: datetime.datetime
    ) -> bool:
        """Processes a TripUpdate entity and updates the corresponding scheduled trip."""

        active_periods = []
        informed_entities = []
        cause = AlertCause.UNKNOWN_CAUSE
        effect = AlertEffect.UNKNOWN_EFFECT
        url = None
        header_text = None
        description_text = None
        severity_level = AlertSeverityLevel.UNKNOWN_SEVERITY

        if alert.HasField("cause"):
            cause = self._alert_cause_map.get(alert.cause, cause)
        if alert.HasField("effect"):
            effect = self._alert_effect_map.get(alert.effect, effect)
        if alert.HasField("url"):
            translations = [
                Translation(text=tl.text, language=tl.language)
                for tl in alert.url.translation
            ]
            url = translations
        if alert.HasField("header_text"):
            translations = [
                Translation(text=tl.text, language=tl.language)
                for tl in alert.header_text.translation
            ]
            header_text = translations
        if alert.HasField("description_text"):
            translations = [
                Translation(text=tl.text, language=tl.language)
                for tl in alert.description_text.translation
            ]
            description_text = translations
        if alert.HasField("severity_level"):
            severity_level = self._alert_severity_level_map.get(
                alert.severity_level,
                severity_level,
            )
        if len(alert.active_period) > 0:
            active_periods = [
                TimeRange(
                    start=(
                        datetime.datetime.fromtimestamp(
                            period.start, tz=datetime.timezone.utc
                        )
                        if period.start
                        else None
                    ),
                    end=(
                        datetime.datetime.fromtimestamp(
                            period.end, tz=datetime.timezone.utc
                        )
                        if period.end
                        else None
                    ),
                )
                for period in alert.active_period
            ]
        if len(alert.informed_entity) > 0:
            informed_entities = [
                EntitySelector(
                    agency_id=entity.agency_id,
                    route_id=entity.route_id,
                    route_type=entity.route_type,
                    trip=(
                        TripDescriptor(
                            direction_id=entity.trip.direction_id,
                            trip_id=entity.trip.trip_id,
                            start_date=entity.trip.start_date,
                            start_time=entity.trip.start_time,
                            route_id=entity.trip.route_id,
                        )
                        if entity.HasField("trip")
                        else None
                    ),
                    stop_id=entity.stop_id,
                    direction_id=entity.direction_id,
                )
                for entity in alert.informed_entity
            ]

        existing_alert = await self._find_alert(alert_id)
        if existing_alert:

            if (
                existing_alert.updated_at.astimezone(datetime.timezone.utc)
                < feed_timestamp_utc
            ):
                self.logger.debug(f"Skipping Alert {alert_id} already up to date.")
                return False

            # Alert already exists, update it
            try:
                existing_alert.cause = cause
                existing_alert.effect = effect
                existing_alert.url = url
                existing_alert.header_text = header_text
                existing_alert.description_text = description_text
                existing_alert.severity_level = severity_level
                existing_alert.active_periods = active_periods
                existing_alert.informed_entities = informed_entities
                existing_alert.updated_at = feed_timestamp_utc
                await existing_alert.save()
                self.logger.debug(f"Successfully updated Alert: {alert_id}")
                return True
            except Exception as e:
                self.logger.error(f"Failed to update Alert: {e}", exc_info=True)
                return False

        alert = Alert(
            producer_alert_id=alert_id,
            agency_id=self.agency_id,
            cause=cause,
            effect=effect,
            url=url,
            header_text=header_text,
            description_text=description_text,
            severity_level=severity_level,
            active_periods=active_periods,
            informed_entities=informed_entities,
            updated_at=feed_timestamp_utc,
        )

        try:
            await alert.save()
            self.logger.debug(f"Successfully saved Alert: {alert}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to save Alert: {e}", exc_info=True)

        return False

    async def _find_alert(self, alert_id: str) -> Optional[Alert]:
        return await Alert.find_one(
            {"producer_alert_id": alert_id, "agency_id": self.agency_id}
        )

    async def _end_missing_alerts(
        self, alert_ids_to_exclude: Set[str], timestamp: datetime.datetime
    ):
        """
        For all alerts that were not processed, mark them as ended.

        Updates all alerts for a given agency that are NOT in the provided list of IDs,
        setting their active period end time to the given timestamp.

        Args:
            alert_ids_to_exclude: A list of producer_alert_ids to exclude from the update.
            timestamp: The datetime to set as the end of the active period.
        """

        self.logger.debug(f"Ending missing alerts if any...")

        try:
            await Alert.find(
                {
                    "agency_id": self.agency_id,
                    "producer_alert_id": {"$nin": alert_ids_to_exclude},
                }
            ).update_many(
                {"$set": {"active_periods.$[].end": timestamp}},
                # array_filters=[{"elem.end": {"$eq": None}}],  #  Only update periods that don't have an end
            )
            self.logger.debug(f"Successfully ended any missing alerts")
        except Exception as e:
            self.logger.error(f"Failed to end missing alerts: {e}", exc_info=True)

    def _get_entity_timestamp(
        self, entity: Message, feed_timestamp_utc: datetime.datetime
    ) -> datetime.datetime:
        """Gets timestamp from entity or defaults to feed timestamp, ensuring UTC."""
        if entity.HasField("timestamp"):
            ts = entity.timestamp
            return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
        else:
            # Fallback to the feed's timestamp if entity lacks one
            return feed_timestamp_utc
