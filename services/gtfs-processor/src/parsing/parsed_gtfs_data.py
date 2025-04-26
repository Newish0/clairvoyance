import logging
import datetime
from typing import Any, Dict, List, Optional, Set
from collections import defaultdict

import pytz
from domain import ScheduledTrip, StopTimeInfo

class ParsedGTFSData:
    """
    Holds parsed GTFS data and provides methods to process it,
    such as generating ScheduledTrip objects.
    """

    def __init__(
        self,
        agency_timezone: str,
        routes: Dict[str, Dict[str, Any]],
        trips: Dict[str, Dict[str, Any]],
        stop_times: Dict[str, List[Dict[str, Any]]],
        service_dates: Dict[str, List[str]],
        log_level=logging.INFO,
    ):
        """
        Initialize with raw data parsed by GTFSReader.

        Args:
            agency_timezone: The determined timezone string.
            routes: Dictionary of routes keyed by route_id.
            trips: Dictionary of trips keyed by trip_id.
            stop_times: Dictionary of stop time lists keyed by trip_id.
            service_dates: Dictionary of service date lists (YYYYMMDD) keyed by service_id.
            log_level: Logging level.
        """
        self.agency_timezone = agency_timezone
        self.routes = routes
        self.trips = trips
        self.stop_times = stop_times
        self.service_dates = service_dates
        self.logger = self._setup_logger(log_level)

        self.logger.info("ParsedGTFSData initialized.")
        self.logger.info(f"Agency timezone: {self.agency_timezone}")
        self.logger.info(f"Loaded {len(routes)} routes.")
        self.logger.info(f"Loaded {len(trips)} trips.")
        self.logger.info(f"Loaded stop times for {len(stop_times)} trips.")
        self.logger.info(f"Loaded service dates for {len(service_dates)} services.")


    def _setup_logger(self, log_level) -> logging.Logger:
        """Sets up the logger instance."""
        logger = logging.getLogger(f"{__name__}.ParsedGTFSData")
        logger.setLevel(log_level)
        # Ensure handler is added only once if this class is instantiated multiple times
        if not any(isinstance(h, logging.StreamHandler) for h in logger.handlers):
             handler = logging.StreamHandler()
             formatter = logging.Formatter(
                 "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
             )
             handler.setFormatter(formatter)
             logger.addHandler(handler)
        return logger


    def generate_scheduled_trips(self) -> List[ScheduledTrip]:
        """
        Generate ScheduledTrip objects for each trip on each of its active service dates.

        Returns:
            List of ScheduledTrip objects.
        """
        scheduled_trips = []
        skipped_count = 0
        generated_count = 0

        self.logger.info("Generating scheduled trips from parsed GTFS data...")

        for trip_id, trip_data in self.trips.items():
            service_id = trip_data.get("service_id")
            route_id = trip_data.get("route_id")
            trip_stop_times_raw = self.stop_times.get(trip_id)

            # Basic validation
            if not service_id:
                self.logger.debug(f"Trip {trip_id} missing service_id, skipping.")
                skipped_count += 1
                continue
            if not route_id:
                self.logger.debug(f"Trip {trip_id} missing route_id, skipping.")
                skipped_count += 1
                continue
            if route_id not in self.routes:
                 self.logger.warning(f"Trip {trip_id} references unknown route_id {route_id}, skipping.")
                 skipped_count += 1
                 continue
            if not trip_stop_times_raw:
                self.logger.debug(f"Trip {trip_id} has no stop times, skipping.")
                skipped_count += 1
                continue

            active_dates = self.service_dates.get(service_id)
            if not active_dates:
                self.logger.debug(f"Trip {trip_id} service_id {service_id} has no active dates, skipping.")
                # Don't increment skipped_count here, as the trip itself might be valid but just not running
                continue

            # Find start time from the (already sorted) stop times
            start_time = self._find_first_departure_time(trip_stop_times_raw)
            if not start_time:
                self.logger.warning(f"Trip {trip_id} has no valid departure time in its stop times, skipping.")
                skipped_count += 1
                continue

            # Convert stop times to StopTimeInfo objects once per trip
            stop_time_infos = self._convert_stop_times_to_info(trip_stop_times_raw, trip_id)
            if not stop_time_infos:
                 self.logger.warning(f"Could not convert any stop times for trip {trip_id}, skipping.")
                 skipped_count += 1
                 continue
            

            # Create a ScheduledTrip for each active date
            service_date_instance_count = 0
            for service_date in active_dates:
                try:
                    # Extract direction_id safely
                    direction_id_str = trip_data.get("direction_id")
                    direction_id = None
                    if direction_id_str is not None and direction_id_str != '':
                        try:
                            direction_id = int(direction_id_str)
                        except (ValueError, TypeError):
                            self.logger.warning(f"Invalid direction_id '{direction_id_str}' for trip {trip_id}. Setting to None.")

                    
                    scheduled_trip = ScheduledTrip(
                        trip_id=trip_id,
                        start_date=service_date,
                        start_time=start_time,
                        route_id=route_id,
                        service_id=service_id,
                        agency_timezone_str=self.agency_timezone,
                        direction_id=direction_id,
                        shape_id=trip_data.get("shape_id"),
                        trip_headsign=trip_data.get("trip_headsign"),
                        trip_short_name=trip_data.get("trip_short_name"),
                        block_id=trip_data.get("block_id"),
                        scheduled_stop_times=stop_time_infos, # Use pre-converted list
                    )
                    scheduled_trips.append(scheduled_trip)
                    generated_count += 1
                    service_date_instance_count += 1
                except Exception as e:
                    self.logger.error(
                        f"Error creating scheduled trip instance for {trip_id} on {service_date}: {e}",
                        exc_info=True
                    )
                    # Count this as skipped for this specific date instance
                    skipped_count += 1

            if service_date_instance_count > 0:
                self.logger.debug(f"Created {service_date_instance_count} scheduled trip instances for trip_id {trip_id}")

        self.logger.info(f"Successfully generated {generated_count} scheduled trip instances.")
        if skipped_count > 0:
             self.logger.warning(f"Skipped {skipped_count} potential trip instances due to missing data or errors.")

        return scheduled_trips

    def _find_first_departure_time(self, trip_stop_times_raw: List[Dict[str, Any]]) -> Optional[str]:
        """
        Find the departure time of the first stop in the sequence.
        Assumes trip_stop_times_raw is sorted by stop_sequence.
        """
        if not trip_stop_times_raw:
            return None

        first_stop_time = trip_stop_times_raw[0]
        departure_time = first_stop_time.get("departure_time")

        # Basic validation for HH:MM:SS format
        if departure_time and len(departure_time.split(':')) == 3:
            try:
                # Further check if it looks like a valid time
                hours, minutes, seconds = map(int, departure_time.split(':'))
                # GTFS allows times > 23:59:59
                if hours >= 0 and 0 <= minutes < 60 and 0 <= seconds < 60:
                     return departure_time
                else:
                     self.logger.debug(f"Invalid time component in departure_time '{departure_time}' for first stop.")
                     return None
            except ValueError:
                 self.logger.debug(f"Non-integer component in departure_time '{departure_time}' for first stop.")
                 return None
        else:
             self.logger.debug(f"Missing or invalid format for departure_time '{departure_time}' for first stop.")
             return None


    def _convert_stop_times_to_info(self, stop_times_raw: List[Dict[str, Any]], trip_id_for_logging: str) -> List[StopTimeInfo]:
        """Convert raw stop time dictionaries to StopTimeInfo objects."""
        stop_time_infos = []
        conversion_errors = 0

        for st_raw in stop_times_raw:
            try:
                # --- Type Conversions with Error Handling ---
                stop_id = st_raw.get("stop_id", "")
                if not stop_id:
                    raise ValueError("Missing stop_id")

                stop_sequence_str = st_raw.get("stop_sequence")
                if stop_sequence_str is None or not stop_sequence_str.isdigit():
                     raise ValueError(f"Invalid or missing stop_sequence: '{stop_sequence_str}'")
                stop_sequence = int(stop_sequence_str)

                # Optional fields: Check existence before conversion
                pickup_type = None
                if st_raw.get("pickup_type") is not None and st_raw.get("pickup_type") != '':
                     try:
                         pickup_type = int(st_raw["pickup_type"])
                     except (ValueError, TypeError):
                          self.logger.debug(f"Invalid pickup_type '{st_raw['pickup_type']}' for stop {stop_id}, seq {stop_sequence}. Using None.")

                drop_off_type = None
                if st_raw.get("drop_off_type") is not None and st_raw.get("drop_off_type") != '':
                     try:
                         drop_off_type = int(st_raw["drop_off_type"])
                     except (ValueError, TypeError):
                          self.logger.debug(f"Invalid drop_off_type '{st_raw['drop_off_type']}' for stop {stop_id}, seq {stop_sequence}. Using None.")

                shape_dist_traveled = None
                shape_dist_str = st_raw.get("shape_dist_traveled")
                if shape_dist_str is not None and shape_dist_str != '':
                    try:
                        shape_dist_traveled = float(shape_dist_str)
                    except (ValueError, TypeError):
                         self.logger.debug(f"Invalid shape_dist_traveled '{shape_dist_str}' for stop {stop_id}, seq {stop_sequence}. Using None.")

                # Create the object
                stop_info = StopTimeInfo(
                    stop_id=stop_id,
                    stop_sequence=stop_sequence,
                    arrival_time=st_raw.get("arrival_time"), # Keep as string for now
                    departure_time=st_raw.get("departure_time"), # Keep as string
                    stop_headsign=st_raw.get("stop_headsign"),
                    pickup_type=pickup_type,
                    drop_off_type=drop_off_type,
                    shape_dist_traveled=shape_dist_traveled,
                )
                stop_time_infos.append(stop_info)

            except (ValueError, TypeError) as e:
                self.logger.warning(f"Could not convert stop time for trip {trip_id_for_logging}: {e}. Raw data: {st_raw}")
                conversion_errors += 1

        # The list should already be sorted by stop_sequence from the reader
        # If sorting failed earlier, this won't fix it, but we assume it worked.
        # stop_time_infos.sort(key=lambda x: x.stop_sequence) # Redundant if reader sort worked

        if conversion_errors > 0:
             self.logger.warning(f"Encountered {conversion_errors} errors converting stop times for trip {trip_id_for_logging}.")

        return stop_time_infos