import datetime
import re
import logging
from typing import Dict, List, Optional, Tuple, Any, Union
from pathlib import Path
import pytz
import requests
from google.transit import gtfs_realtime_pb2
from google.protobuf.message import Message

from model import ScheduledTripDocument, StopTimeInfo, Position, RealtimeStopTimeUpdate
from domain import ScheduleRelationship, OccupancyStatus, VehicleStopStatus


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)  # Configure basic logging

# --- Type Aliases ---
DataSource = Union[str, Path]  # URL string or local file Path


class RealtimeUpdaterService:
    """
    Service to fetch GTFS Realtime data, parse it, find corresponding
    scheduled trips in MongoDB, and update them with realtime information.
    """

    def __init__(self, request_timeout: int = 30):
        """
        Initializes the RealtimeUpdaterService.

        Args:
            request_timeout: Timeout in seconds for fetching data from URLs.
        """
        self.request_timeout = request_timeout

        # --- Mappings from Protobuf Enum Ints to Domain Enums ---
        # TripDescriptor.ScheduleRelationship
        self._trip_schedule_relationship_map: Dict[int, ScheduleRelationship] = {
            gtfs_realtime_pb2.TripDescriptor.SCHEDULED: ScheduleRelationship.SCHEDULED,
            gtfs_realtime_pb2.TripDescriptor.ADDED: ScheduleRelationship.ADDED,
            gtfs_realtime_pb2.TripDescriptor.UNSCHEDULED: ScheduleRelationship.UNSCHEDULED,
            gtfs_realtime_pb2.TripDescriptor.CANCELED: ScheduleRelationship.CANCELED,
            # TODO: Add mapping for V2 enums
            # # Assuming v2 enums map directly if they exist in domain
            # getattr(gtfs_realtime_pb2.TripDescriptor, 'REPLACEMENT', -1): ScheduleRelationship.REPLACEMENT,
            # getattr(gtfs_realtime_pb2.TripDescriptor, 'DUPLICATED', -1): ScheduleRelationship.DUPLICATED,
            # getattr(gtfs_realtime_pb2.TripDescriptor, 'DELETED', -1): ScheduleRelationship.DELETED,
        }
        
        
        

        # TODO: Add mappings for stop time updates
        # TripUpdate.StopTimeUpdate.ScheduleRelationship
        # self._stoptime_schedule_relationship_map: Dict[int, ScheduleRelationship] = {
        #     gtfs_realtime_pb2.TripUpdate.StopTimeUpdate.SCHEDULED: ScheduleRelationship.SCHEDULED,
        #     gtfs_realtime_pb2.TripUpdate.StopTimeUpdate.SKIPPED: ScheduleRelationship.SKIPPED,
        #     gtfs_realtime_pb2.TripUpdate.StopTimeUpdate.NO_DATA: ScheduleRelationship.NO_DATA,
        # }
        # VehiclePosition.OccupancyStatus
        self._occupancy_status_map: Dict[int, OccupancyStatus] = {
            gtfs_realtime_pb2.VehiclePosition.EMPTY: OccupancyStatus.EMPTY,
            gtfs_realtime_pb2.VehiclePosition.MANY_SEATS_AVAILABLE: OccupancyStatus.MANY_SEATS_AVAILABLE,
            gtfs_realtime_pb2.VehiclePosition.FEW_SEATS_AVAILABLE: OccupancyStatus.FEW_SEATS_AVAILABLE,
            gtfs_realtime_pb2.VehiclePosition.STANDING_ROOM_ONLY: OccupancyStatus.STANDING_ROOM_ONLY,
            gtfs_realtime_pb2.VehiclePosition.CRUSHED_STANDING_ROOM_ONLY: OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY,
            gtfs_realtime_pb2.VehiclePosition.FULL: OccupancyStatus.FULL,
            gtfs_realtime_pb2.VehiclePosition.NOT_ACCEPTING_PASSENGERS: OccupancyStatus.NOT_ACCEPTING_PASSENGERS,
            # V2 Additions - map them if they exist in the domain enum
            getattr(gtfs_realtime_pb2.VehiclePosition, "NO_DATA", -1): OccupancyStatus.NO_DATA,
            getattr(gtfs_realtime_pb2.VehiclePosition, "NOT_BOARDABLE", -1): OccupancyStatus.NOT_BOARDABLE
        }
        
        self._vehicle_stop_status_map: Dict[int, VehicleStopStatus] = {
            gtfs_realtime_pb2.VehiclePosition.INCOMING_AT: VehicleStopStatus.INCOMING_AT,
            gtfs_realtime_pb2.VehiclePosition.STOPPED_AT: VehicleStopStatus.STOPPED_AT,
            gtfs_realtime_pb2.VehiclePosition.IN_TRANSIT_TO: VehicleStopStatus.IN_TRANSIT_TO
        }
        
        # Filter out None values from map in case V2 enums don't exist in domain
        self._occupancy_status_map = {
            k: v for k, v in self._occupancy_status_map.items() if v is not None
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
        processed_vehicle_positions = 0
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

            for entity in feed.entity:
                if entity.HasField("trip_update"):
                    if await self._process_trip_update(
                        entity.trip_update, feed_timestamp_utc
                    ):
                        processed_trip_updates += 1

                elif entity.HasField("vehicle"):
                    if await self._process_vehicle_position(
                        entity.vehicle, feed_timestamp_utc
                    ):
                        processed_vehicle_positions += 1
                # elif entity.HasField("alert"):
                # pass # Placeholder for future alert processing

            logger.info(
                f"Processed {processed_trip_updates} trip updates, "
                f"{processed_vehicle_positions} vehicle positions out of "
                f"{total_entities} entities from {data_source}"
            )

        except Exception as e:
            logger.error(
                f"Failed to process feed from {data_source}: {e}", exc_info=True
            )

        return processed_trip_updates, processed_vehicle_positions, total_entities

    def _fetch_feed_content(self, data_source: DataSource) -> Optional[bytes]:
        """Fetches GTFS Realtime data from URL or reads from file."""
        logger.info(f"Fetching realtime data from: {data_source}")
        try:
            if isinstance(data_source, Path):
                if not data_source.is_file():
                    logger.error(f"File not found: {data_source}")
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
                    logger.error(f"File not found: {data_source}")
                    return None
                return path.read_bytes()
        except requests.RequestException as e:
            logger.error(f"HTTP error fetching {data_source}: {e}")
            return None
        except IOError as e:
            logger.error(f"File I/O error reading {data_source}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching/reading {data_source}: {e}")
            return None

    def _parse_feed_message(
        self, content: bytes
    ) -> Optional[gtfs_realtime_pb2.FeedMessage]:
        """Parses protobuf content into a FeedMessage object."""
        try:
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(content)
            logger.debug("Successfully parsed GTFS Realtime feed.")
            return feed
        except Exception as e:
            logger.error(f"Failed to parse protobuf feed: {e}")
            return None

    def _get_feed_timestamp(
        self, feed: gtfs_realtime_pb2.FeedMessage
    ) -> datetime.datetime:
        """Gets the timestamp from the feed header or current time, ensuring UTC."""
        if feed.header.HasField("timestamp"):
            ts = feed.header.timestamp
            # Assume timestamp is Unix epoch
            dt_naive = datetime.datetime.utcfromtimestamp(ts)
            return pytz.utc.localize(dt_naive)
        else:
            # Fallback to current time if header timestamp is missing
            logger.warning("Feed header missing timestamp, using current time.")
            return datetime.datetime.now(pytz.utc)

    @staticmethod
    def _extract_core_trip_id(gtfs_rt_trip_id: str) -> str:
        """Extracts the core trip ID by removing potential update suffixes (like '#...')."""
        return gtfs_rt_trip_id.split("#")[0]

    async def _find_scheduled_trip(
        self, trip_descriptor: gtfs_realtime_pb2.TripDescriptor
    ) -> Optional[ScheduledTripDocument]:
        """
        Finds the corresponding ScheduledTripDocument in MongoDB.
        Matches primarily on trip_id and start_date.
        """
        if not trip_descriptor.HasField("trip_id"):
            logger.warning(
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
            # Let's go with Option 1 for now as it's safer.
            logger.warning(
                f"TripUpdate/VehiclePosition for trip_id '{core_trip_id}' missing start_date. Skipping."
            )
            return None

        # Use Beanie's find_one to query MongoDB
        try:
            # Query using the indexed fields for performance
            trip = await ScheduledTripDocument.find_one(
                ScheduledTripDocument.trip_id == core_trip_id,
                ScheduledTripDocument.start_date == start_date_str,
            )
            if not trip:
                logger.debug(
                    f"No scheduled trip found for trip_id={core_trip_id}, start_date={start_date_str}"
                )
            return trip  # Returns the document or None
        except Exception as e:
            logger.error(
                f"Database error finding scheduled trip for {core_trip_id} on {start_date_str}: {e}",
                exc_info=True,
            )
            return None

    async def _process_trip_update(
        self,
        trip_update: gtfs_realtime_pb2.TripUpdate,
        feed_timestamp_utc: datetime.datetime,
    ) -> bool:
        """Processes a TripUpdate entity and updates the corresponding scheduled trip."""
        scheduled_trip = await self._find_scheduled_trip(trip_update.trip)
        if not scheduled_trip:
            return False  # Logged in _find_scheduled_trip

        update_timestamp_utc = self._get_entity_timestamp(
            trip_update, feed_timestamp_utc
        )
        needs_save = False

        # --- Update Trip-Level Information ---
        if trip_update.trip.HasField("schedule_relationship"):
            new_rel = self._trip_schedule_relationship_map.get(
                trip_update.trip.schedule_relationship,
                ScheduleRelationship.SCHEDULED,  # Default if unknown
            )
            if scheduled_trip.realtime_schedule_relationship != new_rel:
                scheduled_trip.realtime_schedule_relationship = new_rel
                needs_save = True

        if trip_update.HasField("vehicle") and trip_update.vehicle.HasField("id"):
            vehicle_id = trip_update.vehicle.id
            if scheduled_trip.vehicle_id != vehicle_id:
                scheduled_trip.vehicle_id = vehicle_id
                needs_save = True

        # --- Process Stop Time Updates ---
        for stu in trip_update.stop_time_update:
            stop_sequence = stu.stop_sequence  # Required field
            stop_id = stu.stop_id  # Optional, but useful for verification

            # Find the scheduled stop time info (for reference and delay calculation)
            scheduled_stop = next(
                (
                    s
                    for s in scheduled_trip.scheduled_stop_times
                    if s.stop_sequence == stop_sequence
                ),
                None,
            )
            if not scheduled_stop:
                logger.warning(
                    f"StopTimeUpdate for trip {scheduled_trip.trip_id} has unknown stop_sequence {stop_sequence}. Skipping update."
                )
                continue  # Skip this specific stop time update

            # Use provided stop_id if available, otherwise use the one from scheduled data
            effective_stop_id = stop_id if stop_id else scheduled_stop.stop_id

            # Get existing or create new realtime update object
            rt_update = scheduled_trip.realtime_stop_updates.get(str(stop_sequence))
            if not rt_update:
                rt_update = RealtimeStopTimeUpdate(
                    stop_sequence=stop_sequence,
                    stop_id=effective_stop_id,  # Store for reference
                )
                scheduled_trip.realtime_stop_updates[str(stop_sequence)] = rt_update
                needs_save = True  # Adding a new entry requires saving

            # Update fields within the RealtimeStopTimeUpdate
            if stu.HasField("arrival"):
                arrival_delay = stu.arrival.delay
                predicted_arrival = self._calculate_predicted_time_utc(
                    scheduled_trip.start_datetime,
                    scheduled_trip.start_time,
                    scheduled_stop.arrival_time,
                    arrival_delay,
                )
                if (
                    rt_update.arrival_delay != arrival_delay
                    or rt_update.predicted_arrival_time != predicted_arrival
                ):
                    rt_update.arrival_delay = arrival_delay
                    rt_update.predicted_arrival_time = predicted_arrival
                    needs_save = True

            if stu.HasField("departure"):
                departure_delay = stu.departure.delay
                predicted_departure = self._calculate_predicted_time_utc(
                    scheduled_trip.start_datetime,
                    scheduled_trip.start_time,
                    scheduled_stop.departure_time,
                    departure_delay,
                )
                if (
                    rt_update.departure_delay != departure_delay
                    or rt_update.predicted_departure_time != predicted_departure
                ):
                    rt_update.departure_delay = departure_delay
                    rt_update.predicted_departure_time = predicted_departure
                    needs_save = True

            # TODO: Update to include schedule_relationship
            # if stu.HasField("schedule_relationship"):
            #      new_rel = self._stoptime_schedule_relationship_map.get(
            #          stu.schedule_relationship, ScheduleRelationship.SCHEDULED # Default if unknown
            #      )
            #      if rt_update.schedule_relationship != new_rel:
            #          rt_update.schedule_relationship = new_rel
            #          needs_save = True

            # TODO: Add logic for clearing arrival/departure if skipped
            # # Clear arrival/departure if skipped
            # if rt_update.schedule_relationship == ScheduleRelationship.SKIPPED:
            #     if rt_update.arrival_delay is not None or rt_update.departure_delay is not None:
            #         rt_update.arrival_delay = None
            #         rt_update.departure_delay = None
            #         rt_update.predicted_arrival_time = None
            #         rt_update.predicted_departure_time = None
            #         needs_save = True

        # --- Update Timestamp and Save ---
        if needs_save:
            scheduled_trip.last_realtime_update_timestamp = update_timestamp_utc
            try:
                await scheduled_trip.save()
                logger.debug(
                    f"Successfully updated trip {scheduled_trip.trip_id} from TripUpdate."
                )
                return True
            except Exception as e:
                logger.error(
                    f"Failed to save updated trip {scheduled_trip.trip_id}: {e}",
                    exc_info=True,
                )
                return False
        else:
            logger.debug(
                f"No relevant changes detected for trip {scheduled_trip.trip_id} from TripUpdate."
            )
            return True  # No error, just no changes needed saving

    async def _process_vehicle_position(
        self,
        vehicle: gtfs_realtime_pb2.VehiclePosition,
        feed_timestamp_utc: datetime.datetime,
    ) -> bool:
        """Processes a VehiclePosition entity and updates the corresponding scheduled trip."""
        # Only process if the vehicle is associated with a trip
        if not vehicle.HasField("trip"):
            logger.debug(
                f"Skipping VehiclePosition for vehicle {vehicle.vehicle.id} as it's not assigned to a trip."
            )
            return False

        scheduled_trip = await self._find_scheduled_trip(vehicle.trip)
        if not scheduled_trip:
            # This might be expected if a vehicle finishes a trip but still reports position briefly
            logger.debug(
                f"No scheduled trip found for VehiclePosition (vehicle: {vehicle.vehicle.id}, trip: {vehicle.trip.trip_id}). Skipping update."
            )
            return False

        update_timestamp_utc = self._get_entity_timestamp(vehicle, feed_timestamp_utc)
        needs_save = False

        # --- Update Vehicle ID ---
        if vehicle.HasField("vehicle") and vehicle.vehicle.HasField("id"):
            vehicle_id = vehicle.vehicle.id
            if scheduled_trip.vehicle_id != vehicle_id:
                scheduled_trip.vehicle_id = vehicle_id
                needs_save = True
        
        # --- Update Status ---
        if vehicle.HasField("current_status"):
            new_status = self._vehicle_stop_status_map.get(vehicle.current_status)
            if new_status is not None and scheduled_trip.current_status != new_status:
                scheduled_trip.current_status = new_status
                needs_save = True

        # --- Update Current Stop Sequence ---
        if vehicle.HasField("current_stop_sequence"):
            new_seq = int(vehicle.current_stop_sequence)
            if scheduled_trip.current_stop_sequence != new_seq:
                scheduled_trip.current_stop_sequence = new_seq
                needs_save = True

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
            # Simple update: always replace current position if new one exists
            # TODO: More complex logic could check if timestamp is newer too
            if scheduled_trip.current_position != new_position:
                scheduled_trip.current_position = new_position
                # Add to history
                if scheduled_trip.position_history is None:
                    scheduled_trip.position_history = []

                scheduled_trip.position_history.append(new_position)

                needs_save = True

        # --- Update Occupancy ---
        if vehicle.HasField("occupancy_status"):
            new_occ = self._occupancy_status_map.get(vehicle.occupancy_status)
            if new_occ is not None and scheduled_trip.current_occupancy != new_occ:
                scheduled_trip.current_occupancy = new_occ
                needs_save = True

        # --- Update Trip Schedule Relationship (if provided in Vehicle message) ---
        # This is less common than in TripUpdate, but possible
        if vehicle.trip.HasField("schedule_relationship"):
            new_rel = self._trip_schedule_relationship_map.get(
                vehicle.trip.schedule_relationship, ScheduleRelationship.SCHEDULED
            )
            if scheduled_trip.realtime_schedule_relationship != new_rel:
                scheduled_trip.realtime_schedule_relationship = new_rel
                needs_save = True

        # --- Update Timestamp and Save ---
        if needs_save:
            # Always update the timestamp if we save any changes from this entity
            scheduled_trip.last_realtime_update_timestamp = update_timestamp_utc
            try:
                await scheduled_trip.save()
                logger.debug(
                    f"Successfully updated trip {scheduled_trip.trip_id} from VehiclePosition (Vehicle ID: {scheduled_trip.vehicle_id})."
                )
                return True
            except Exception as e:
                logger.error(
                    f"Failed to save updated trip {scheduled_trip.trip_id} from VehiclePosition: {e}",
                    exc_info=True,
                )
                return False
        else:
            logger.debug(
                f"No relevant changes detected for trip {scheduled_trip.trip_id} from VehiclePosition."
            )
            return True  # No error, just no changes needed

    def _get_entity_timestamp(
        self, entity: Message, feed_timestamp_utc: datetime.datetime
    ) -> datetime.datetime:
        """Gets timestamp from entity or defaults to feed timestamp, ensuring UTC."""
        if entity.HasField("timestamp"):
            ts = entity.timestamp
            dt_naive = datetime.datetime.utcfromtimestamp(ts)
            return pytz.utc.localize(dt_naive)
        else:
            # Fallback to the feed's timestamp if entity lacks one
            return feed_timestamp_utc

    @staticmethod
    def _parse_hhmmss_to_delta(time_str: Optional[str]) -> Optional[datetime.timedelta]:
        """Parses HH:MM:SS string (can be >24h) into a timedelta."""
        if not time_str:
            return None
        match = re.match(r"\s*(\d+):([0-5]\d):([0-5]\d)\s*", time_str)
        if match:
            h, m, s = map(int, match.groups())
            return datetime.timedelta(hours=h, minutes=m, seconds=s)
        logger.warning(f"Could not parse HH:MM:SS string: '{time_str}'")
        return None

    def _calculate_predicted_time_utc(
        self,
        trip_start_datetime_utc: Optional[datetime.datetime],
        trip_start_time_str: str,  # HH:MM:SS
        stop_time_str: Optional[str],  # HH:MM:SS
        delay_seconds: Optional[int],
    ) -> Optional[datetime.datetime]:
        """
        Calculates the predicted UTC time for a stop event.

        Args:
            trip_start_datetime_utc: The precomputed start datetime of the trip in UTC.
            trip_start_time_str: The scheduled start time string (HH:MM:SS).
            stop_time_str: The scheduled arrival/departure time string for the stop (HH:MM:SS).
            delay_seconds: The realtime delay in seconds.

        Returns:
            The predicted time in UTC, or None if calculation is not possible.
        """
        if (
            trip_start_datetime_utc is None
            or stop_time_str is None
            or delay_seconds is None
        ):  # Delay 0 is valid, None is not
            return None

        start_delta = self._parse_hhmmss_to_delta(trip_start_time_str)
        stop_delta = self._parse_hhmmss_to_delta(stop_time_str)

        if start_delta is None or stop_delta is None:
            logger.warning(
                f"Could not parse start time '{trip_start_time_str}' or stop time '{stop_time_str}' to calculate predicted time."
            )
            return None

        # Calculate the time difference from trip start to this stop's scheduled event time
        time_diff_from_start = stop_delta - start_delta

        # Scheduled time for the stop event in UTC
        scheduled_stop_datetime_utc = trip_start_datetime_utc + time_diff_from_start

        # Predicted time in UTC
        predicted_stop_datetime_utc = scheduled_stop_datetime_utc + datetime.timedelta(
            seconds=delay_seconds
        )

        return predicted_stop_datetime_utc
