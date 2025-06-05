import logging
from typing import Any, Dict, Iterator, List, Optional, Tuple

from models import ScheduledTripDocument, StopTimeInfo
from dataclasses import dataclass
from config import setup_logger
from models.gtfs_enums import (
    ContinuousPickupDropOff,
    LocationType,
    RouteType,
    StopTimeUpdateScheduleRelationship,
    WheelchairBoarding,
)
from models.gtfs_models import LineStringGeometry, PointGeometry, Route, Shape, Stop


@dataclass(frozen=True)
class PartialStopTimeInfo:
    stop_id: str
    arrival_time: str
    departure_time: str
    stop_sequence: int
    stop_headsign: Optional[str] = None
    pickup_type: Optional[int] = None
    drop_off_type: Optional[int] = None
    # TODO: Add other fields per GTFS StopTime specs...
    shape_dist_traveled: Optional[float] = None


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
        stops: Dict[str, Dict[str, Any]],
        shapes: Dict[str, List[Dict[str, Any]]],
        logger: Optional[logging.Logger] = None,
    ):
        """
        Initialize with raw data parsed by GTFSReader.

        Args:
            agency_timezone: The determined timezone string.
            routes: Dictionary of routes keyed by route_id.
            trips: Dictionary of trips keyed by trip_id.
            stop_times: Dictionary of stop time lists keyed by trip_id.
            service_dates: Dictionary of service date lists (YYYYMMDD) keyed by service_id.
            stops: Dictionary of stops keyed by stop_id.
            shapes: Dictionary of shape point lists keyed by shape_id.
            logger: Optional custom logger instance. If not provided, uses the centralized setup_logger.
        """
        self.agency_timezone = agency_timezone
        self.routes = routes
        self.trips = trips
        self.stop_times = stop_times
        self.service_dates = service_dates
        self.stops = stops
        self.shapes = shapes
        self.logger = logger if logger is not None else setup_logger(__name__)

        self.logger.info("ParsedGTFSData initialized.")
        self.logger.info(f"Agency timezone: {self.agency_timezone}")
        self.logger.info(f"Loaded {len(routes)} routes.")
        self.logger.info(f"Loaded {len(trips)} trips.")
        self.logger.info(f"Loaded {len(stops)} stops.")
        self.logger.info(f"Loaded {len(shapes)} shapes (with points).")
        self.logger.info(f"Loaded stop times for {len(stop_times)} trips.")
        self.logger.info(f"Loaded service dates for {len(service_dates)} services.")

    def generate_scheduled_trips(self) -> Iterator[ScheduledTripDocument | None]:
        """
        Generate ScheduledTripDocument objects for each trip on each of its active service dates.

        Yields:
            Iterator[ScheduledTripDocument | None]: An iterator of ScheduledTripDocument objects or None if an error occurs.
        """

        self.logger.info("Generating scheduled trips from parsed GTFS data...")

        for trip_id, trip_data in self.trips.items():
            service_id = trip_data.get("service_id")
            route_id = trip_data.get("route_id")
            trip_stop_times_raw = self.stop_times.get(trip_id)

            # Basic validation
            if not service_id:
                self.logger.debug(f"Trip {trip_id} missing service_id, skipping.")
                yield None
                continue
            if not route_id:
                self.logger.debug(f"Trip {trip_id} missing route_id, skipping.")
                yield None
                continue
            if route_id not in self.routes:
                self.logger.warning(
                    f"Trip {trip_id} references unknown route_id {route_id}, skipping."
                )
                yield None
                continue
            if not trip_stop_times_raw:
                self.logger.debug(f"Trip {trip_id} has no stop times, skipping.")
                yield None
                continue

            active_dates = self.service_dates.get(service_id)
            if not active_dates:
                self.logger.debug(
                    f"Trip {trip_id} service_id {service_id} has no active dates, skipping."
                )
                # Don't yield None here, as the trip itself might be valid but just not running
                continue

            route_short_name = self._find_route_short_name(route_id)

            # Find start time from the (already sorted) stop times
            start_time = self._find_first_departure_time(trip_stop_times_raw)
            if not start_time:
                self.logger.warning(
                    f"Trip {trip_id} has no valid departure time in its stop times, skipping."
                )
                yield None
                continue

            # Convert stop times to StopTimeInfo objects once per trip
            # Current state does not include derived fields which are added later
            # and create new instance of the stop time specific to that scheduled trip.
            partial_stop_times = self._derive_partial_stop_times(
                trip_stop_times_raw, trip_id
            )
            if not partial_stop_times:
                self.logger.warning(
                    f"Could not convert any stop times for trip {trip_id}, skipping."
                )
                yield None
                continue

            # Create a ScheduledTrip for each active date
            service_date_instance_count = 0
            for service_date in active_dates:
                try:
                    # Extract direction_id safely
                    direction_id_str = trip_data.get("direction_id")
                    direction_id = None
                    if direction_id_str is not None and direction_id_str != "":
                        try:
                            direction_id = int(direction_id_str)
                        except (ValueError, TypeError):
                            self.logger.warning(
                                f"Invalid direction_id '{direction_id_str}' for trip {trip_id}. Setting to None."
                            )

                    final_stop_times = [
                        self._derive_full_stop_time_info(stop_time_info, service_date)
                        for stop_time_info in partial_stop_times
                    ]

                    scheduled_trip = ScheduledTripDocument(
                        trip_id=trip_id,
                        start_date=service_date,
                        start_time=start_time,
                        route_id=route_id,
                        route_short_name=route_short_name,
                        service_id=service_id,
                        agency_timezone_str=self.agency_timezone,
                        direction_id=direction_id,
                        shape_id=trip_data.get("shape_id"),
                        trip_headsign=trip_data.get("trip_headsign"),
                        trip_short_name=trip_data.get("trip_short_name"),
                        block_id=trip_data.get("block_id"),
                        stop_times=final_stop_times,
                        start_datetime=ScheduledTripDocument.convert_to_datetime(
                            date_str=service_date,
                            time_str=start_time,
                            tz_str=self.agency_timezone,
                        ),
                    )
                    yield scheduled_trip
                    service_date_instance_count += 1
                except Exception as e:
                    self.logger.error(
                        f"Error creating scheduled trip instance for {trip_id} on {service_date}: {e}",
                        exc_info=True,
                    )
                    yield None

            if service_date_instance_count > 0:
                self.logger.debug(
                    f"Created {service_date_instance_count} scheduled trip instances for trip_id {trip_id}"
                )

    def _derive_full_stop_time_info(
        self, partial_stop_time_info: PartialStopTimeInfo, date_str: str
    ) -> StopTimeInfo:
        """Convert a list of partially completed stop times to StopTimeInfo objects by computing its derived fields."""
        tz_str = self.agency_timezone
        arrival_datetime = ScheduledTripDocument.convert_to_datetime(
            date_str, partial_stop_time_info.arrival_time, tz_str
        )
        departure_datetime = ScheduledTripDocument.convert_to_datetime(
            date_str, partial_stop_time_info.departure_time, tz_str
        )
        return StopTimeInfo(
            stop_id=partial_stop_time_info.stop_id,
            stop_sequence=partial_stop_time_info.stop_sequence,
            stop_headsign=partial_stop_time_info.stop_headsign,
            pickup_type=partial_stop_time_info.pickup_type,
            drop_off_type=partial_stop_time_info.drop_off_type,
            # TODO: Add other fields...
            shape_dist_traveled=partial_stop_time_info.shape_dist_traveled,
            arrival_datetime=arrival_datetime,
            departure_datetime=departure_datetime,
            predicted_arrival_datetime=None,
            predicted_departure_datetime=None,
            predicted_arrival_uncertainty=None,
            predicted_departure_uncertainty=None,
            schedule_relationship=StopTimeUpdateScheduleRelationship.SCHEDULED,
            arrival_delay=None,
            departure_delay=None,
        )

    def _find_route_short_name(self, route_id: str) -> Optional[str]:
        return self.routes.get(route_id, {}).get("route_short_name")

    def _find_first_departure_time(
        self, trip_stop_times_raw: List[Dict[str, Any]]
    ) -> Optional[str]:
        """
        Find the departure time of the first stop in the sequence.
        Assumes trip_stop_times_raw is sorted by stop_sequence.
        """
        if not trip_stop_times_raw:
            return None

        first_stop_time = trip_stop_times_raw[0]
        departure_time = first_stop_time.get("departure_time")

        # Basic validation for HH:MM:SS format
        if departure_time and len(departure_time.split(":")) == 3:
            try:
                # Further check if it looks like a valid time
                hours, minutes, seconds = map(int, departure_time.split(":"))
                # GTFS allows times > 23:59:59
                if hours >= 0 and 0 <= minutes < 60 and 0 <= seconds < 60:
                    return departure_time
                else:
                    self.logger.debug(
                        f"Invalid time component in departure_time '{departure_time}' for first stop."
                    )
                    return None
            except ValueError:
                self.logger.debug(
                    f"Non-integer component in departure_time '{departure_time}' for first stop."
                )
                return None
        else:
            self.logger.debug(
                f"Missing or invalid format for departure_time '{departure_time}' for first stop."
            )
            return None

    def _derive_partial_stop_times(
        self, stop_times_raw: List[Dict[str, Any]], trip_id_for_logging: str
    ) -> List[PartialStopTimeInfo]:
        """Convert raw stop time dictionaries to PartialStopTimeInfo objects."""
        stop_time_infos: List[PartialStopTimeInfo] = []
        conversion_errors = 0

        for st_raw in stop_times_raw:
            try:
                # --- Type Conversions with Error Handling ---
                stop_id = st_raw.get("stop_id", "")
                if not stop_id:
                    raise ValueError("Missing stop_id")

                stop_sequence_str = st_raw.get("stop_sequence")
                if stop_sequence_str is None or not stop_sequence_str.isdigit():
                    raise ValueError(
                        f"Invalid or missing stop_sequence: '{stop_sequence_str}'"
                    )
                stop_sequence = int(stop_sequence_str)

                pickup_type = None
                if (
                    st_raw.get("pickup_type") is not None
                    and st_raw.get("pickup_type") != ""
                ):
                    try:
                        pickup_type = int(st_raw["pickup_type"])
                    except (ValueError, TypeError):
                        self.logger.debug(
                            f"Invalid pickup_type '{st_raw['pickup_type']}' for stop {stop_id}, seq {stop_sequence}. Using None."
                        )

                drop_off_type = None
                if (
                    st_raw.get("drop_off_type") is not None
                    and st_raw.get("drop_off_type") != ""
                ):
                    try:
                        drop_off_type = int(st_raw["drop_off_type"])
                    except (ValueError, TypeError):
                        self.logger.debug(
                            f"Invalid drop_off_type '{st_raw['drop_off_type']}' for stop {stop_id}, seq {stop_sequence}. Using None."
                        )

                shape_dist_traveled = None
                shape_dist_str = st_raw.get("shape_dist_traveled")
                if shape_dist_str is not None and shape_dist_str != "":
                    try:
                        shape_dist_traveled = float(shape_dist_str)
                    except (ValueError, TypeError):
                        self.logger.debug(
                            f"Invalid shape_dist_traveled '{shape_dist_str}' for stop {stop_id}, seq {stop_sequence}. Using None."
                        )

                partial_stop_info = PartialStopTimeInfo(
                    stop_id=stop_id,
                    stop_sequence=stop_sequence,
                    arrival_time=st_raw.get("arrival_time"),
                    departure_time=st_raw.get("departure_time"),
                    stop_headsign=st_raw.get("stop_headsign"),
                    pickup_type=pickup_type,
                    drop_off_type=drop_off_type,
                    # TODO: Add other fields...
                    shape_dist_traveled=shape_dist_traveled,
                )
                stop_time_infos.append(partial_stop_info)

            except (ValueError, TypeError) as e:
                self.logger.warning(
                    f"Could not convert stop time for trip {trip_id_for_logging}: {e}. Raw data: {st_raw}"
                )
                conversion_errors += 1

        if conversion_errors > 0:
            self.logger.warning(
                f"Encountered {conversion_errors} errors converting stop times for trip {trip_id_for_logging}."
            )

        return stop_time_infos

    def generate_stops(self) -> Iterator[Stop | None]:
        """
        Create Stop documents from the parsed GTFS data.

        Yields:
            Iterator[Stop | None]: An iterator of Stop documents or None if an error occurs.
        """

        for stop_id, stop_data in self.stops.items():
            try:
                # --- Location Geometry ---
                location_geom = None
                lat_str = stop_data.get("stop_lat")
                lon_str = stop_data.get("stop_lon")
                if lat_str and lon_str:  # Check for non-empty strings
                    try:
                        lat = float(lat_str)
                        lon = float(lon_str)
                        location_geom = PointGeometry(coordinates=[lon, lat])
                    except (ValueError, TypeError) as coord_err:
                        self.logger.debug(
                            f"Invalid coordinates for stop {stop_id}: lat='{lat_str}', lon='{lon_str}'. Skipping location. Error: {coord_err}"
                        )

                # --- Enums with Defaults ---
                loc_type_val = stop_data.get("location_type")
                location_type = LocationType.STOP  # Default
                if loc_type_val:
                    try:
                        location_type = LocationType(int(loc_type_val))
                    except (ValueError, TypeError):
                        self.logger.debug(
                            f"Invalid location_type '{loc_type_val}' for stop {stop_id}. Using default {location_type.name}."
                        )

                wc_val = stop_data.get("wheelchair_boarding")
                wheelchair_boarding = WheelchairBoarding.NO_INFO  # Default
                if wc_val:
                    try:
                        wheelchair_boarding = WheelchairBoarding(int(wc_val))
                    except (ValueError, TypeError):
                        self.logger.debug(
                            f"Invalid wheelchair_boarding '{wc_val}' for stop {stop_id}. Using default {wheelchair_boarding.name}."
                        )

                yield Stop(
                    stop_id=stop_id,
                    stop_code=stop_data.get("stop_code"),
                    stop_name=stop_data.get("stop_name"),
                    stop_desc=stop_data.get("stop_desc"),
                    location=location_geom,
                    zone_id=stop_data.get("zone_id"),
                    stop_url=stop_data.get("stop_url"),
                    location_type=location_type,
                    parent_station_id=stop_data.get("parent_station"),
                    stop_timezone=stop_data.get("stop_timezone"),
                    wheelchair_boarding=wheelchair_boarding,
                    level_id=stop_data.get("level_id"),
                    platform_code=stop_data.get("platform_code"),
                )

            except Exception as e:
                self.logger.warning(
                    f"Error processing stop {stop_id}: {e}. Skipping.",
                    exc_info=self.logger.isEnabledFor(logging.DEBUG),
                )
                yield None

    def generate_routes(self) -> Iterator[Route | None]:
        """
        Create Route documents from the parsed GTFS data.

        Yields:
            Iterator[Route | None]: None if skipped due to error, otherwise a Route document.
        """
        for route_id, route_data in self.routes.items():
            try:
                # Mandatory Route Type
                route_type_val = route_data.get("route_type")
                if not route_type_val:  # Check for None or empty string
                    self.logger.warning(
                        f"Route {route_id} has missing or empty route_type. Skipping."
                    )
                    yield None
                    continue
                try:
                    route_type_enum = RouteType(int(route_type_val))
                except (ValueError, TypeError) as enum_err:
                    self.logger.warning(
                        f"Invalid route_type '{route_type_val}' for route {route_id}: {enum_err}. Skipping."
                    )
                    yield None
                    continue

                # --- Optional Enums with Defaults ---
                pickup_val = route_data.get("continuous_pickup")
                continuous_pickup = ContinuousPickupDropOff.NONE
                if pickup_val:
                    try:
                        continuous_pickup = ContinuousPickupDropOff(int(pickup_val))
                    except (ValueError, TypeError):
                        self.logger.debug(
                            f"Invalid continuous_pickup '{pickup_val}' for route {route_id}. Using default {continuous_pickup.name}."
                        )

                dropoff_val = route_data.get("continuous_drop_off")
                continuous_drop_off = ContinuousPickupDropOff.NONE
                if dropoff_val:
                    try:
                        continuous_drop_off = ContinuousPickupDropOff(int(dropoff_val))
                    except (ValueError, TypeError):
                        self.logger.debug(
                            f"Invalid continuous_drop_off '{dropoff_val}' for route {route_id}. Using default {continuous_drop_off.name}."
                        )

                route_sort_order = None
                sort_order_str = route_data.get("route_sort_order")
                if sort_order_str:
                    try:
                        route_sort_order = int(sort_order_str)
                    except (ValueError, TypeError):
                        self.logger.debug(
                            f"Invalid route_sort_order '{sort_order_str}' for route {route_id}. Setting to None."
                        )

                # --- Create Route Document ---
                yield Route(
                    route_id=route_id,
                    agency_id=route_data.get("agency_id"),
                    route_short_name=route_data.get("route_short_name"),
                    route_long_name=route_data.get("route_long_name"),
                    route_desc=route_data.get("route_desc"),
                    route_type=route_type_enum,
                    route_url=route_data.get("route_url"),
                    route_color=route_data.get("route_color"),
                    route_text_color=route_data.get("route_text_color"),
                    route_sort_order=route_sort_order,
                    continuous_pickup=continuous_pickup,
                    continuous_drop_off=continuous_drop_off,
                )

            except Exception as e:
                self.logger.warning(
                    f"Error processing route {route_id}: {e}. Skipping.",
                    exc_info=self.logger.isEnabledFor(logging.DEBUG),
                )
                yield None

    def generate_shapes(self) -> Iterator[Shape | None]:
        """
        Create Shape documents from the parsed GTFS data.

        Yields:
            Iterator[Shape | None]: None if skipped due to error, otherwise a Shape document.
        """
        for shape_id, shape_points_raw in self.shapes.items():
            coordinates = []
            distances = []
            point_parse_errors = 0
            has_valid_distance = False  # Track if any distance is valid

            try:
                # Points should already be sorted by sequence by the reader
                for point_row in shape_points_raw:
                    try:
                        lat = float(point_row["shape_pt_lat"])
                        lon = float(point_row["shape_pt_lon"])
                        coordinates.append([lon, lat])  # GeoJSON order

                        # Handle distance
                        dist_str = point_row.get("shape_dist_traveled")
                        dist = None
                        if dist_str:  # Check for non-empty string
                            try:
                                dist = float(dist_str)
                                has_valid_distance = (
                                    True  # Mark that we found at least one
                                )
                            except (ValueError, TypeError):
                                self.logger.debug(
                                    f"Invalid shape_dist_traveled '{dist_str}' for point in shape {shape_id}. Appending None."
                                )
                        distances.append(dist)  # Append None if invalid or missing

                    except (ValueError, TypeError, KeyError) as point_err:
                        point_parse_errors += 1
                        self.logger.debug(
                            f"Error parsing point for shape {shape_id}: {point_err} - Row: {point_row}. Skipping point."
                        )
                        # Continue processing other points for this shape

                # If no valid points were parsed at all
                if not coordinates:
                    self.logger.warning(
                        f"Shape {shape_id} has no valid coordinate points after parsing. Skipping shape."
                    )
                    yield None
                    continue  # Skip this shape entirely

                if point_parse_errors > 0:
                    self.logger.warning(
                        f"Shape {shape_id} was processed with {point_parse_errors} point errors."
                    )

                # --- Create Shape Document ---
                geometry = LineStringGeometry(coordinates=coordinates)
                yield Shape(
                    shape_id=shape_id,
                    geometry=geometry,
                    # Only include distances if at least one valid distance was found
                    distances_traveled=distances if has_valid_distance else None,
                )

            except Exception as e:
                # Catch errors during shape document creation itself
                self.logger.warning(
                    f"Error creating document for shape {shape_id}: {e}. Skipping.",
                    exc_info=self.logger.isEnabledFor(logging.DEBUG),
                )
                yield None
