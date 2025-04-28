import datetime
import re
from typing import Dict, List, Optional, Tuple, Any

import pytz  # Required for timezone handling
from beanie import Document, Indexed
from pydantic import BaseModel, Field, model_validator, field_validator
import pymongo


from enum import IntEnum

from domain import ScheduleRelationship, OccupancyStatus, VehicleStopStatus


# --- Helper Pydantic Models (for Beanie/MongoDB compatibility) ---
# Using Pydantic BaseModel is generally preferred for Beanie documents
class StopTimeInfo(BaseModel):
    stop_id: str
    stop_sequence: int
    arrival_time: Optional[str] = None  # HH:MM:SS format
    departure_time: Optional[str] = None  # HH:MM:SS format
    stop_headsign: Optional[str] = None
    pickup_type: Optional[int] = None
    drop_off_type: Optional[int] = None
    shape_dist_traveled: Optional[float] = None


class Position(BaseModel):
    latitude: float
    longitude: float
    timestamp: datetime.datetime  # Expecting timezone-aware UTC
    bearing: Optional[float] = None
    speed: Optional[float] = None  # meters per second


class RealtimeStopTimeUpdate(BaseModel):
    stop_sequence: int
    stop_id: str  # From scheduled data, for reference
    arrival_delay: Optional[int] = None  # seconds
    predicted_arrival_time: Optional[datetime.datetime] = None  # TZ-aware UTC
    departure_delay: Optional[int] = None  # seconds
    predicted_departure_time: Optional[datetime.datetime] = None  # TZ-aware UTC
    schedule_relationship: ScheduleRelationship = ScheduleRelationship.SCHEDULED


# --- Main Beanie Document ---
class ScheduledTripDocument(Document):
    """
    Represents a specific instance of a vehicle trip, persisted in MongoDB using Beanie.
    Includes precomputed fields for efficient querying.
    """

    # Pydantic v2 config to allow extra fields if needed during creation from dict
    # model_config = ConfigDict(extra='allow')

    # --- Core Identifiers (Indexed for fast lookups) ---
    # Unique compound index for the logical trip instance
    trip_id: Indexed(str)
    start_date: Indexed(str)  # YYYYMMDD
    start_time: Indexed(str)  # HH:MM:SS (Scheduled start time)

    # --- Other Static GTFS Data ---
    route_id: Indexed(str)
    service_id: str
    agency_timezone_str: str = "UTC"
    direction_id: Optional[int] = None
    shape_id: Optional[str] = None
    trip_headsign: Optional[str] = None
    trip_short_name: Optional[str] = None
    block_id: Optional[str] = None
    scheduled_stop_times: List[StopTimeInfo] = Field(default_factory=list)

    # --- Real-time Data Fields ---
    realtime_schedule_relationship: ScheduleRelationship = (
        ScheduleRelationship.SCHEDULED
    )
    # MongoDB object keys must be strings. If using dict, ensure keys are str.
    # Alternatively, store as List[RealtimeStopTimeUpdate] if dict key isn't critical for queries
    realtime_stop_updates: Dict[str, RealtimeStopTimeUpdate] = Field(
        default_factory=dict
    )  # Key: str(stop_sequence)
    current_stop_sequence: Optional[int] = None
    
    # The exact status of the vehicle with respect to the current stop.
    # Ignored if current_stop_sequence is missing.
    current_status: Optional[VehicleStopStatus] = None

    
    vehicle_id: Optional[Indexed(str)] = None  # Index if querying by vehicle
    current_occupancy: Optional[OccupancyStatus] = None
    last_realtime_update_timestamp: Optional[Indexed(datetime.datetime)] = (
        None  # TZ-aware UTC, index for recency queries
    )

    # --- Position Data ---
    current_position: Optional[Position] = None
    position_history: List[Position] = Field(
        default_factory=list
    )  # Consider capping size or using TTL if grows too large

    # --- DERIVED & PERSISTED FIELD FOR PERFORMANCE ---
    # These fields are calculated *before* saving using the validator below.
    start_datetime: Optional[Indexed(datetime.datetime)] = Field(default=None)

    # --- Methods ---
    @staticmethod
    def _parse_hhmmss(time_str: Optional[str]) -> Optional[Tuple[int, int, int]]:
        """Parses HH:MM:SS, handling >23 hours. Returns (h, m, s) or None."""
        if not time_str:
            return None
        # Relax regex slightly to handle potential leading/trailing whitespace
        match = re.match(r"\s*(\d+):([0-5]\d):([0-5]\d)\s*", time_str)
        if match:
            return int(match.group(1)), int(match.group(2)), int(match.group(3))
        print(f"Warning: Could not parse time string: '{time_str}'")  # Add logging
        return None

    @model_validator(mode="before")  # Pydantic v2+
    @classmethod
    def precompute_start_datetime(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Precomputes the start_datetime based on start_date, start_time,
        and agency_timezone_str before validation/saving.
        Stores the result in UTC.
        """
        start_date_str = values.get("start_date")
        start_time_str = values.get("start_time")
        tz_str = values.get("agency_timezone_str", "UTC")  # Default to UTC if missing
        computed_dt = None  # Initialize

        if start_date_str and start_time_str:
            try:
                parsed_st = cls._parse_hhmmss(start_time_str)
                if parsed_st:
                    h, m, s = parsed_st
                    base_date = datetime.datetime.strptime(
                        start_date_str, "%Y%m%d"
                    ).date()
                    days_offset = h // 24
                    actual_hour = h % 24
                    actual_date = base_date + datetime.timedelta(days=days_offset)

                    # Get the timezone object
                    try:
                        agency_tz = pytz.timezone(tz_str)
                    except pytz.UnknownTimeZoneError:
                        print(f"Warning: Unknown timezone '{tz_str}', using UTC.")
                        agency_tz = pytz.utc

                    # Create naive datetime first
                    naive_dt = datetime.datetime(
                        actual_date.year,
                        actual_date.month,
                        actual_date.day,
                        actual_hour,
                        m,
                        s,
                    )

                    # Localize to agency timezone (handles DST etc.)
                    # Use is_dst=None for ambiguous/non-existent times during DST transitions
                    local_dt = agency_tz.localize(naive_dt, is_dst=None)

                    # Convert to UTC for consistent storage and querying
                    computed_dt = local_dt.astimezone(pytz.utc)

            except ValueError as e:
                # Handle potential parsing errors (e.g., invalid date format)
                print(
                    f"Error computing start datetime for {values.get('trip_id')}: {e}"
                )
                # Keep computed_dt as None
            except Exception as e:
                # Catch unexpected errors during calculation
                print(
                    f"Unexpected error computing start datetime for {values.get('trip_id')}: {e}"
                )
                # Keep computed_dt as None

        # Add the computed value (or None if calculation failed) to the data
        values["start_datetime"] = computed_dt
        return values

    # --- Beanie Settings ---
    class Settings:
        name = "scheduled_trips"  # MongoDB collection name
        indexes = [
            # Compound index for unique scheduled trip instance lookup
            [
                ("trip_id", pymongo.ASCENDING),
                ("start_date", pymongo.ASCENDING),
                ("start_time", pymongo.ASCENDING),
            ],
            # Descending index for finding the latest updated trips efficiently
            [("last_realtime_update_timestamp", pymongo.DESCENDING)],
            # Descending index on the computed start time (useful for time-based queries)
            [("start_datetime", pymongo.DESCENDING)],
        ]














# --- Helper GeoJSON Models ---

class PointGeometry(BaseModel):
    """Represents a GeoJSON Point object."""
    type: str = Field(default="Point", frozen=True)
    coordinates: List[float] # [longitude, latitude]

    @field_validator('coordinates')
    @classmethod
    def validate_coordinates(cls, v):
        if len(v) != 2:
            raise ValueError("Coordinates must contain exactly two values: [longitude, latitude]")
        lon, lat = v
        if not (-180 <= lon <= 180):
            raise ValueError("Longitude must be between -180 and 180")
        if not (-90 <= lat <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        return v

class LineStringGeometry(BaseModel):
    """Represents a GeoJSON LineString object."""
    type: str = Field(default="LineString", frozen=True)
    coordinates: List[List[float]] # Array of [longitude, latitude] pairs

    @field_validator('coordinates')
    @classmethod
    def validate_coordinates(cls, v):
        if not v: # Must have at least one point, though GTFS usually requires >= 2
             raise ValueError("Coordinates list cannot be empty for a LineString")
        for i, point in enumerate(v):
            if len(point) != 2:
                raise ValueError(f"Each point in coordinates must contain exactly two values: [longitude, latitude]. Error at index {i}")
            lon, lat = point
            if not (-180 <= lon <= 180):
                raise ValueError(f"Longitude must be between -180 and 180. Error at index {i}")
            if not (-90 <= lat <= 90):
                raise ValueError(f"Latitude must be between -90 and 90. Error at index {i}")
        return v

# --- Enums based on GTFS Specification (same as before) ---

class LocationType(IntEnum):
    STOP = 0
    STATION = 1
    ENTRANCE_EXIT = 2
    GENERIC_NODE = 3
    BOARDING_AREA = 4

class WheelchairBoarding(IntEnum):
    NO_INFO = 0
    ACCESSIBLE = 1
    NOT_ACCESSIBLE = 2

class RouteType(IntEnum):
    TRAM = 0
    SUBWAY = 1
    RAIL = 2
    BUS = 3
    FERRY = 4
    CABLE_TRAM = 5
    AERIAL_LIFT = 6
    FUNICULAR = 7
    TROLLEYBUS = 11
    MONORAIL = 12
    # Add more as needed from GTFS spec

class ContinuousPickupDropOff(IntEnum):
    CONTINUOUS = 0
    NONE = 1
    PHONE_AGENCY = 2
    COORDINATE_WITH_DRIVER = 3

# --- Revised Beanie Document Models ---

class Stop(Document):
    """
    Represents a GTFS stop or station (from stops.txt).
    Designed for geospatial queries using MongoDB's features.
    """
    stop_id: Indexed(str, unique=True) # From stop_id
    stop_code: Optional[Indexed(str)] = None
    stop_name: Optional[Indexed(str)] = None # Index for searching by name
    stop_desc: Optional[str] = None
    # Use PointGeometry for native MongoDB geospatial support
    location: Optional[PointGeometry] = None # Derived from stop_lat, stop_lon
    zone_id: Optional[str] = None
    stop_url: Optional[str] = None
    location_type: Optional[LocationType] = LocationType.STOP
    # parent_station can be used to link stations and stops.
    # Using the stop_id string for linking is flexible.
    parent_station_id: Optional[Indexed(str)] = None # References stop_id of parent
    stop_timezone: Optional[str] = None
    wheelchair_boarding: Optional[WheelchairBoarding] = WheelchairBoarding.NO_INFO
    level_id: Optional[str] = None
    platform_code: Optional[str] = None

    class Settings:
        name = "stops"
        indexes = [
            # *** CRITICAL FOR GEOSPATIAL QUERIES ***
            # Use 2dsphere for accurate queries on sphere (Earth)
            pymongo.IndexModel(
                [("location", pymongo.GEOSPHERE)], # Use GEOSPHERE for Point data on sphere
                 name="location_geosphere_idx"
            ),
            # Add other indexes via Indexed() decorator above or here
            pymongo.IndexModel([("stop_name", pymongo.TEXT)], name="stop_name_text_idx") # Optional: for text search
        ]

class Route(Document):
    """
    Represents a GTFS route (from routes.txt).
    Kept relatively simple; relationships to Trips/Shapes are often better
    handled via linking or embedding within the Trip model (not shown here).
    """
    route_id: Indexed(str, unique=True) # From route_id
    agency_id: Optional[Indexed(str)] = None # Links to an Agency collection
    route_short_name: Optional[Indexed(str)] = None
    route_long_name: Optional[Indexed(str)] = None
    route_desc: Optional[str] = None
    route_type: RouteType
    route_url: Optional[str] = None
    route_color: Optional[str] = None
    route_text_color: Optional[str] = None
    route_sort_order: Optional[int] = None
    continuous_pickup: Optional[ContinuousPickupDropOff] = ContinuousPickupDropOff.NONE
    continuous_drop_off: Optional[ContinuousPickupDropOff] = ContinuousPickupDropOff.NONE

    # Potential NoSQL Enhancement: Could embed agency details if Agency doesn't change often
    # agency_details: Optional[EmbeddedAgency] = None

    class Settings:
        name = "routes"
        indexes = [
             # Add compound indexes if needed, e.g., (agency_id, route_short_name)
             # Indexes are defined above using Indexed() decorator for single fields
             pymongo.IndexModel(
                 [("route_short_name", pymongo.TEXT), ("route_long_name", pymongo.TEXT)],
                 name="route_name_text_idx" # Optional: for text search
             )
        ]


class Shape(Document):
    """
    Represents a complete GTFS shape (derived from shapes.txt).
    Leverages NoSQL by storing the entire shape geometry as one LineString,
    making it efficient to retrieve a shape's path.
    """
    shape_id: Indexed(str, unique=True) # From shape_id - now unique per document

    # Embed the entire geometry as a GeoJSON LineString
    geometry: LineStringGeometry

    # Store the sequence of distances traveled, parallel to the geometry coordinates
    # This preserves the shape_dist_traveled info from shapes.txt
    distances_traveled: Optional[List[Optional[float]]] = None # Array of distances corresponding to each point

    class Settings:
        name = "shapes"
        indexes = [
            # Geospatial index on the LineString for spatial queries on shapes
            # (e.g., find shapes intersecting a region)
             pymongo.IndexModel(
                [("geometry", pymongo.GEOSPHERE)], # Use GEOSPHERE for LineString data on sphere
                 name="geometry_geosphere_idx"
            )
            # shape_id is already indexed uniquely via the decorator
        ]