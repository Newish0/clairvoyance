import logging
import zipfile
import csv
import io
import os
import pytz
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple
import datetime
from parsing.parsed_gtfs_data import ParsedGTFSData

class GTFSReader:
    """
    Reads GTFS static data from a zip file and extracts raw data.
    Does not perform complex processing or object creation.
    """

    def __init__(self, default_timezone: str = "UTC", logger: Optional[logging.Logger] = None):
        """
        Initialize the reader with a default timezone.

        Args:
            default_timezone: Fallback timezone string if agency.txt doesn't specify one.
            log_level: Logging level (default: INFO).
        """
        self.default_timezone = default_timezone
        self.logger = logger or self._setup_logger(logging.INFO)

        # Validate timezone
        try:
            pytz.timezone(default_timezone)
        except pytz.exceptions.UnknownTimeZoneError:
            self.logger.error(
                f"Invalid default timezone: {default_timezone}, falling back to UTC"
            )
            self.default_timezone = "UTC"

    def _setup_logger(self, log_level) -> logging.Logger:
        """Sets up the logger instance."""
        logger = logging.getLogger(f"{__name__}.GTFSReader")
        logger.setLevel(log_level)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger
    
    def parse(self, zip_file_path: str) -> ParsedGTFSData:
        (
            agency_timezone,
            routes,
            trips,
            stop_times,
            service_dates,
            _, # services set not directly needed by ParsedGTFSData constructor
            stops,
            shapes
        ) = self._read_gtfs_zip(zip_file_path)
        
        parsed_data = ParsedGTFSData(
            agency_timezone=agency_timezone,
            routes=routes,
            trips=trips,
            stop_times=stop_times,
            service_dates=service_dates,
            stops=stops,
            shapes=shapes,
            logger=self.logger
        )
        
        return parsed_data
        

    def _read_gtfs_zip(self, zip_file_path: str) -> Tuple[Dict[str, Any], ...]:
        """
        Reads a GTFS zip file and returns the raw parsed data.

        Args:
            zip_file_path: Path to the GTFS zip file.

        Returns:
            A tuple containing:
            - agency_timezone (str)
            - routes (Dict[str, Dict[str, Any]])
            - trips (Dict[str, Dict[str, Any]])
            - stop_times (Dict[str, List[Dict[str, Any]]])
            - service_dates (Dict[str, List[str]])
            - services (Set[str]) - All unique service_ids found
            - stops (Dict[str, Dict[str, Any]]) 
            - shapes (Dict[str, List[Dict[str, Any]]])  (grouped points)

        Raises:
            FileNotFoundError: If the zip file doesn't exist.
            ValueError: If the file is not a valid zip file.
            Exception: For other parsing errors.
        """
        self.logger.info(f"Starting to read GTFS data from {zip_file_path}")

        if not os.path.exists(zip_file_path):
            self.logger.error(f"GTFS zip file not found: {zip_file_path}")
            raise FileNotFoundError(f"GTFS zip file not found: {zip_file_path}")

        try:
            with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
                self.logger.info(
                    f"ZIP file opened successfully, found files: {zip_ref.namelist()}"
                )
                filenames_in_zip = set(zip_ref.namelist())

                # First parse agency.txt to get timezone
                agency_timezone = self._parse_agency(zip_ref, filenames_in_zip)

                # Parse other files
                routes = self._parse_routes(zip_ref, filenames_in_zip)
                trips, services = self._parse_trips(zip_ref, filenames_in_zip)
                service_dates = self._parse_calendar(zip_ref, filenames_in_zip)
                service_dates = self._parse_calendar_dates(zip_ref, filenames_in_zip, service_dates)
                stop_times = self._parse_stop_times(zip_ref, filenames_in_zip)
                stops = self._parse_stops(zip_ref, filenames_in_zip)       
                shapes = self._parse_shapes(zip_ref, filenames_in_zip)     

                return agency_timezone, routes, trips, stop_times, service_dates, services, stops, shapes

        except zipfile.BadZipFile:
            self.logger.error(f"Invalid zip file: {zip_file_path}")
            raise ValueError(f"Invalid zip file: {zip_file_path}")
        except Exception as e:
            self.logger.error(f"Error reading GTFS data: {str(e)}", exc_info=True)
            raise Exception(f"Error reading GTFS data: {str(e)}")

    def _read_csv_from_zip(self, zip_ref: zipfile.ZipFile, filename: str) -> Optional[csv.DictReader]:
        """Helper to read a CSV file from the zip archive."""
        try:
            file_content = zip_ref.read(filename)
            # Decode with utf-8-sig to handle potential BOM
            text_content = io.TextIOWrapper(io.BytesIO(file_content), encoding='utf-8-sig')
            return csv.DictReader(text_content)
        except KeyError:
            self.logger.info(f"{filename} not found in GTFS zip file.")
            return None
        except Exception as e:
            self.logger.error(f"Error reading {filename} from zip: {e}")
            return None

    def _parse_agency(self, zip_ref: zipfile.ZipFile, filenames: Set[str]) -> str:
        """Parse agency.txt to extract timezone information."""
        agency_timezone = self.default_timezone
        filename = "agency.txt"
        if filename in filenames:
            self.logger.debug(f"Parsing {filename}")
            reader = self._read_csv_from_zip(zip_ref, filename)
            if reader:
                try:
                    for row in reader:
                        tz_str = row.get("agency_timezone")
                        if tz_str:
                            try:
                                pytz.timezone(tz_str) # Validate
                                agency_timezone = tz_str
                                self.logger.info(f"Using agency timezone: {agency_timezone}")
                                break # Use first agency's timezone
                            except pytz.exceptions.UnknownTimeZoneError:
                                self.logger.warning(f"Invalid timezone in {filename}: {tz_str}")
                                continue
                except Exception as e:
                    self.logger.warning(f"Could not parse agency timezone from {filename}: {e}")
            else:
                 self.logger.warning(f"{filename} found but could not be read.")
        else:
            self.logger.warning(f"{filename} not found in GTFS zip file.")

        if agency_timezone == self.default_timezone:
             self.logger.info(f"Using default timezone: {self.default_timezone}")

        return agency_timezone

    def _parse_routes(self, zip_ref: zipfile.ZipFile, filenames: Set[str]) -> Dict[str, Dict[str, Any]]:
        """Parse routes.txt to build route dictionary."""
        routes: Dict[str, Dict[str, Any]] = {}
        filename = "routes.txt"
        if filename in filenames:
            self.logger.debug(f"Parsing {filename}")
            reader = self._read_csv_from_zip(zip_ref, filename)
            if reader:
                route_count = 0
                try:
                    for row in reader:
                        route_id = row.get("route_id")
                        if route_id:
                            routes[route_id] = row
                            route_count += 1
                        else:
                            self.logger.warning(f"Found route without route_id in {filename}")
                    self.logger.info(f"Parsed {route_count} routes from {filename}")
                except Exception as e:
                     self.logger.error(f"Error parsing {filename}: {e}", exc_info=True)
            else:
                 self.logger.warning(f"{filename} found but could not be read.")
        else:
             self.logger.warning(f"{filename} not found in GTFS zip file.")
        return routes

    def _parse_trips(self, zip_ref: zipfile.ZipFile, filenames: Set[str]) -> Tuple[Dict[str, Dict[str, Any]], Set[str]]:
        """Parse trips.txt to build trip dictionary and collect service IDs."""
        trips: Dict[str, Dict[str, Any]] = {}
        services: Set[str] = set()
        filename = "trips.txt"
        if filename in filenames:
            self.logger.debug(f"Parsing {filename}")
            reader = self._read_csv_from_zip(zip_ref, filename)
            if reader:
                trip_count = 0
                missing_data_count = 0
                try:
                    for row in reader:
                        trip_id = row.get("trip_id")
                        service_id = row.get("service_id")
                        if trip_id and service_id:
                            trips[trip_id] = row
                            services.add(service_id)
                            trip_count += 1
                        else:
                            missing_data_count += 1
                            self.logger.debug(f"Skipping trip with missing trip_id or service_id: {row}")
                    self.logger.info(f"Parsed {trip_count} trips from {filename}")
                    if missing_data_count > 0:
                        self.logger.warning(f"Skipped {missing_data_count} trips with missing required data")
                except Exception as e:
                     self.logger.error(f"Error parsing {filename}: {e}", exc_info=True)
            else:
                 self.logger.warning(f"{filename} found but could not be read.")
        else:
             self.logger.warning(f"{filename} not found in GTFS zip file.")
        return trips, services

    def _parse_calendar(self, zip_ref: zipfile.ZipFile, filenames: Set[str]) -> Dict[str, List[str]]:
        """Parse calendar.txt to get initial service dates."""
        service_dates: Dict[str, List[str]] = defaultdict(list)
        filename = "calendar.txt"
        if filename in filenames:
            self.logger.debug(f"Parsing {filename}")
            reader = self._read_csv_from_zip(zip_ref, filename)
            if reader:
                service_count = 0
                error_count = 0
                try:
                    for row in reader:
                        service_id = row.get("service_id")
                        if not service_id:
                            self.logger.warning(f"Found calendar entry without service_id in {filename}")
                            continue

                        try:
                            start_date_str = row.get("start_date", "")
                            end_date_str = row.get("end_date", "")
                            if not start_date_str or not end_date_str:
                                raise ValueError("Missing start_date or end_date")

                            start_date = datetime.datetime.strptime(start_date_str, "%Y%m%d").date()
                            end_date = datetime.datetime.strptime(end_date_str, "%Y%m%d").date()

                            day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                            active_days = [i for i, day in enumerate(day_names) if row.get(day) == "1"]

                            date_count = 0
                            current_date = start_date
                            while current_date <= end_date:
                                if current_date.weekday() in active_days:
                                    date_str = current_date.strftime("%Y%m%d")
                                    service_dates[service_id].append(date_str)
                                    date_count += 1
                                current_date += datetime.timedelta(days=1)

                            self.logger.debug(f"Service {service_id}: Found {date_count} active dates from {start_date} to {end_date} via {filename}")
                            service_count += 1

                        except (ValueError, TypeError) as e:
                            self.logger.warning(f"Invalid date format or missing data in {filename} for service {service_id}: {e} - Row: {row}")
                            error_count += 1

                    self.logger.info(f"Parsed {service_count} services from {filename} with {error_count} errors")
                except Exception as e:
                     self.logger.error(f"Error parsing {filename}: {e}", exc_info=True)
            else:
                 self.logger.warning(f"{filename} found but could not be read.")
        else:
            self.logger.info(f"{filename} not found. Relying on calendar_dates.txt if present.")
        return service_dates


    def _parse_calendar_dates(self, zip_ref: zipfile.ZipFile, filenames: Set[str], service_dates: Dict[str, List[str]]) -> Dict[str, List[str]]:
        """Parse calendar_dates.txt to handle exceptions."""
        filename = "calendar_dates.txt"
        if filename in filenames:
            self.logger.debug(f"Parsing {filename}")
            reader = self._read_csv_from_zip(zip_ref, filename)
            if reader:
                exception_count = 0
                added_count = 0
                removed_count = 0
                error_count = 0
                try:
                    for row in reader:
                        service_id = row.get("service_id")
                        date_str = row.get("date")
                        exception_type = row.get("exception_type")

                        if not (service_id and date_str and exception_type):
                            self.logger.warning(f"Skipping {filename} entry with missing required fields: {row}")
                            error_count += 1
                            continue

                        # Validate date format
                        try:
                             datetime.datetime.strptime(date_str, "%Y%m%d")
                        except ValueError:
                             self.logger.warning(f"Invalid date format '{date_str}' in {filename} for service {service_id}. Skipping entry.")
                             error_count += 1
                             continue

                        try:
                            # 1 = service added, 2 = service removed
                            current_dates_for_service = set(service_dates[service_id]) # Use set for efficiency
                            if exception_type == "1":
                                if date_str not in current_dates_for_service:
                                    current_dates_for_service.add(date_str)
                                    added_count += 1
                                exception_count += 1
                            elif exception_type == "2":
                                if date_str in current_dates_for_service:
                                    current_dates_for_service.remove(date_str)
                                    removed_count += 1
                                exception_count += 1
                            else:
                                self.logger.warning(f"Unknown exception_type: {exception_type} for service {service_id} on date {date_str} in {filename}")
                                error_count += 1

                            service_dates[service_id] = sorted(list(current_dates_for_service)) # Store back as sorted list

                        except Exception as e:
                            self.logger.warning(f"Error processing {filename} entry: {row} - {e}")
                            error_count += 1

                    self.logger.info(f"Processed {exception_count} exceptions from {filename} ({added_count} added, {removed_count} removed, {error_count} errors)")
                except Exception as e:
                     self.logger.error(f"Error parsing {filename}: {e}", exc_info=True)
            else:
                 self.logger.warning(f"{filename} found but could not be read.")
        else:
            self.logger.info(f"{filename} not found in GTFS zip file")
        return service_dates


    def _parse_stop_times(self, zip_ref: zipfile.ZipFile, filenames: Set[str]) -> Dict[str, List[Dict[str, Any]]]:
        """Parse stop_times.txt to build stop times dictionary, grouped by trip_id."""
        stop_times_by_trip: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        filename = "stop_times.txt"
        if filename in filenames:
            self.logger.debug(f"Parsing {filename}")
            reader = self._read_csv_from_zip(zip_ref, filename)
            if reader:
                self.logger.debug(f"Column headers in {filename}: {reader.fieldnames}")
                stop_time_count = 0
                error_count = 0
                trips_with_stops = set()
                try:
                    # Collect all stop times first
                    all_stop_times_raw = []
                    for row in reader:
                         trip_id = row.get("trip_id")
                         if trip_id:
                             all_stop_times_raw.append(row)
                             stop_time_count += 1
                         else:
                              self.logger.warning(f"Found stop time without trip_id in {filename}")
                              error_count += 1

                    self.logger.debug(f"Collected {stop_time_count} raw stop time entries")

                    # Sort by trip_id and stop_sequence for correct ordering
                    try:
                        all_stop_times_raw.sort(
                            key=lambda x: (
                                x.get("trip_id", ""),
                                # Handle potential non-integer stop_sequence gracefully
                                int(x.get("stop_sequence", "0")) if x.get("stop_sequence", "").isdigit() else float('inf')
                            )
                        )
                        self.logger.debug(f"Successfully sorted {stop_time_count} stop times by trip_id and stop_sequence")
                    except Exception as e:
                        self.logger.error(f"Error sorting stop times: {e}. Grouping may be affected.", exc_info=True)

                    # Group by trip_id
                    for row in all_stop_times_raw:
                        trip_id = row["trip_id"] # We know trip_id exists here
                        stop_times_by_trip[trip_id].append(row)
                        trips_with_stops.add(trip_id)

                    self.logger.info(f"Grouped {stop_time_count} stop times for {len(trips_with_stops)} trips from {filename}")
                    if error_count > 0:
                        self.logger.warning(f"Encountered {error_count} errors (e.g., missing trip_id) while parsing {filename}")

                except Exception as e:
                     self.logger.error(f"Error parsing {filename}: {e}", exc_info=True)
            else:
                 self.logger.warning(f"{filename} found but could not be read.")
        else:
             self.logger.warning(f"{filename} not found in GTFS zip file")
        return stop_times_by_trip

    def _parse_stops(self, zip_ref: zipfile.ZipFile, filenames: Set[str]) -> Dict[str, Dict[str, Any]]:
        """Parse stops.txt to build stop dictionary."""
        stops: Dict[str, Dict[str, Any]] = {}
        filename = "stops.txt"
        if filename in filenames:
            self.logger.debug(f"Parsing {filename}")
            reader = self._read_csv_from_zip(zip_ref, filename)
            if reader:
                stop_count = 0
                error_count = 0
                try:
                    for row in reader:
                        stop_id = row.get("stop_id")
                        if stop_id:
                            stops[stop_id] = row
                            stop_count += 1
                        else:
                            self.logger.warning(f"Found stop without stop_id in {filename}: {row}")
                            error_count += 1
                    self.logger.info(f"Parsed {stop_count} stops from {filename}")
                    if error_count > 0:
                        self.logger.warning(f"Skipped {error_count} stops due to missing stop_id in {filename}")
                except Exception as e:
                     self.logger.error(f"Error parsing {filename}: {e}", exc_info=True)
            else:
                 self.logger.warning(f"{filename} found but could not be read.")
        else:
             self.logger.warning(f"{filename} not found in GTFS zip file.")
        return stops

    def _parse_shapes(self, zip_ref: zipfile.ZipFile, filenames: Set[str]) -> Dict[str, List[Dict[str, Any]]]:
        """
        Parse shapes.txt, grouping points by shape_id.
        The list for each shape_id will contain dicts with shape point data.
        """
        shapes_by_id: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        filename = "shapes.txt"
        if filename in filenames:
            self.logger.debug(f"Parsing {filename}")
            reader = self._read_csv_from_zip(zip_ref, filename)
            if reader:
                point_count = 0
                error_count = 0
                shape_ids_found = set()
                try:
                    for row in reader:
                        shape_id = row.get("shape_id")
                        if shape_id:
                            # Basic validation of required fields for geometry processing later
                            try:
                                # Ensure lat/lon are present and attempt float conversion early
                                float(row.get("shape_pt_lat", ''))
                                float(row.get("shape_pt_lon", ''))
                                # Ensure sequence is present and attempt int conversion early
                                int(row.get("shape_pt_sequence", ''))

                                shapes_by_id[shape_id].append(row)
                                shape_ids_found.add(shape_id)
                                point_count += 1
                            except (ValueError, TypeError, KeyError) as valid_err:
                                self.logger.warning(f"Skipping shape point due to invalid/missing required fields (lat, lon, seq) in {filename}: {valid_err} - Row: {row}")
                                error_count += 1
                        else:
                            self.logger.warning(f"Found shape point without shape_id in {filename}: {row}")
                            error_count += 1
                    self.logger.info(f"Parsed {point_count} shape points for {len(shape_ids_found)} distinct shapes from {filename}")
                    if error_count > 0:
                        self.logger.warning(f"Skipped {error_count} shape points due to errors in {filename}")

                except Exception as e:
                     self.logger.error(f"Error parsing {filename}: {e}", exc_info=True)
            else:
                 self.logger.warning(f"{filename} found but could not be read.")
        else:
             self.logger.info(f"{filename} not found in GTFS zip file.") # Info level might be okay here

        # Sort points within each shape by sequence 
        self.logger.debug("Sorting shape points by sequence...")
        for shape_id in shapes_by_id:
            try:
                shapes_by_id[shape_id].sort(
                    key=lambda x: int(x.get("shape_pt_sequence", "0")) # Graceful handling of missing sequence
                )
            except ValueError:
                self.logger.error(f"Could not sort shape points for shape_id {shape_id} due to non-integer sequence numbers. Shape geometry might be incorrect.")
        self.logger.debug("Finished sorting shape points.")

        return shapes_by_id

