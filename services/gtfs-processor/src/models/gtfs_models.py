"""
IMPORTANT: The use of `Indexed()` is forbidden in Beanie in order for
           `pydantic_to_ts` to work correctly. All indexes must be
           defined in the Settings class of each model.
"""

import datetime
import re
from typing import Dict, List, Optional, Tuple, Any

import pytz
from beanie import Document
from pydantic import BaseModel, Field, model_validator, field_validator
import pymongo

from models import (
    ContinuousPickupDropOff,
    LocationType,
    RouteType,
    WheelchairBoarding,
    TripDescriptorScheduleRelationship,
    OccupancyStatus,
    VehicleStopStatus,
)


# --- Sub-models ---
class StopTimeInfo(BaseModel):
    stop_id: str
    stop_sequence: int
    arrival_time: Optional[str] = None  # HH:MM:SS format
    departure_time: Optional[str] = None  # HH:MM:SS format
    stop_headsign: Optional[str] = None
    pickup_type: Optional[int] = None
    drop_off_type: Optional[int] = None
    shape_dist_traveled: Optional[float] = None

    # --- DERIVED FIELDS ---
    arrival_datetime: Optional[datetime.datetime] = None
    departure_datetime: Optional[datetime.datetime] = None


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
    schedule_relationship: TripDescriptorScheduleRelationship = (
        TripDescriptorScheduleRelationship.SCHEDULED
    )


# --- Main Beanie Document ---
class ScheduledTripDocument(Document):
    """
    Represents a specific instance of a unique trip at a specific time on a specific date.
      - i.e. Each scheduled trip can be uniquely identified by the tuple (trip_id, start_date, start_time).
    Persisted in MongoDB.
    Includes precomputed fields for efficient querying.
    """

    trip_id: str
    start_date: str  # YYYYMMDD
    start_time: str  # HH:MM:SS (Scheduled start time)

    route_id: str
    service_id: str
    route_short_name: Optional[str] = None
    agency_timezone_str: str = "UTC"
    direction_id: Optional[int] = None
    shape_id: Optional[str] = None
    trip_headsign: Optional[str] = None
    trip_short_name: Optional[str] = None
    block_id: Optional[str] = None
    scheduled_stop_times: List[StopTimeInfo] = Field(default_factory=list)

    # --- Real-time Data Fields ---
    realtime_schedule_relationship: TripDescriptorScheduleRelationship = (
        TripDescriptorScheduleRelationship.SCHEDULED
    )
    realtime_stop_updates: Dict[str, RealtimeStopTimeUpdate] = Field(
        default_factory=dict
    )  # Key: str(stop_sequence)
    current_stop_sequence: Optional[int] = None

    # The exact status of the vehicle with respect to the current stop.
    # Ignored if current_stop_sequence is missing.
    current_status: Optional[VehicleStopStatus] = None

    vehicle_id: Optional[str] = None
    current_occupancy: Optional[OccupancyStatus] = None
    last_realtime_update_timestamp: Optional[datetime.datetime] = (
        None  # TZ-aware UTC, index for recency queries
    )

    # --- Realtime Position Data ---
    current_position: Optional[Position] = None
    position_history: List[Position] = Field(default_factory=list)

    # --- Derived & Persisted Fields - For query efficiency ---
    # These fields are calculated *before* saving using the validator below.
    start_datetime: Optional[datetime.datetime] = Field(default=None)

    # --- Methods ---
    @staticmethod
    def _parse_hhmmss(time_str: Optional[str]) -> Optional[Tuple[int, int, int]]:
        """Parses HH:MM:SS, handling >23 hours. Returns (h, m, s) or None."""
        if not time_str:
            return None
        match = re.match(r"\s*(\d+):([0-5]\d):([0-5]\d)\s*", time_str)
        if match:
            return int(match.group(1)), int(match.group(2)), int(match.group(3))
        print(f"Warning: Could not parse time string: '{time_str}'")  # Add logging
        return None

    @staticmethod
    def convert_to_datetime(
        date_str: str, time_str: str, tz_str: str = "UTC"
    ) -> datetime.datetime:
        parsed_time = ScheduledTripDocument._parse_hhmmss(time_str)
        if not parsed_time:
            return None  # Should raise error or be handled by validator
        h, m, s = parsed_time

        base_date = datetime.datetime.strptime(date_str, "%Y%m%d").date()
        days_offset = h // 24
        actual_hour = h % 24
        actual_date = base_date + datetime.timedelta(days=days_offset)

        # Create naive datetime in given timezone
        tz = pytz.timezone(tz_str)
        naive_dt = datetime.datetime(
            actual_date.year, actual_date.month, actual_date.day, actual_hour, m, s
        )
        # Localize to given timezone
        local_dt = tz.localize(naive_dt, is_dst=None)

        return local_dt

    @model_validator(mode="before")
    @classmethod
    def precompute_start_datetime(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Precompute the start_datetime based on start_date, start_time,
        and agency_timezone_str before validation/saving.
        """
        start_date_str = values.get("start_date")
        start_time_str = values.get("start_time")
        tz_str = values.get("agency_timezone_str", "UTC")  # Default to UTC if missing
        if start_date_str and start_time_str:
            values["start_datetime"] = ScheduledTripDocument.convert_to_datetime(
                start_date_str, start_time_str, tz_str
            )
        else:
            values["start_datetime"] = None
        return values

    class Settings:
        name = "scheduled_trips"
        indexes = [
            # Compound index for unique scheduled trip instance lookup
            pymongo.IndexModel(
                [
                    ("trip_id", pymongo.ASCENDING),
                    ("start_date", pymongo.ASCENDING),
                    ("start_time", pymongo.ASCENDING),
                ],
                unique=True,
            ),
            # Indexes to speed up next trips queries
            [("scheduled_stop_times.stop_id", pymongo.ASCENDING)],
            [("scheduled_stop_times.arrival_datetime", pymongo.ASCENDING)],
            [("scheduled_stop_times.departure_datetime", pymongo.ASCENDING)],
            pymongo.IndexModel([("trip_id", pymongo.ASCENDING)]),
            pymongo.IndexModel([("start_date", pymongo.ASCENDING)]),
            pymongo.IndexModel([("start_time", pymongo.ASCENDING)]),
            pymongo.IndexModel([("route_id", pymongo.ASCENDING)]),
            pymongo.IndexModel([("vehicle_id", pymongo.ASCENDING)]),
            pymongo.IndexModel(
                [("last_realtime_update_timestamp", pymongo.DESCENDING)]
            ),
            pymongo.IndexModel([("start_datetime", pymongo.DESCENDING)]),
        ]


# --- Helper GeoJSON Models ---
class PointGeometry(BaseModel):
    """Represents a GeoJSON Point object."""

    type: str = Field(default="Point", frozen=True)
    coordinates: List[float]  # [longitude, latitude]

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v):
        if len(v) != 2:
            raise ValueError(
                "Coordinates must contain exactly two values: [longitude, latitude]"
            )
        lon, lat = v
        if not (-180 <= lon <= 180):
            raise ValueError("Longitude must be between -180 and 180")
        if not (-90 <= lat <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        return v


class LineStringGeometry(BaseModel):
    """Represents a GeoJSON LineString object."""

    type: str = Field(default="LineString", frozen=True)
    coordinates: List[List[float]]  # Array of [longitude, latitude] pairs

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v):
        if not v:  # Must have at least one point, though GTFS usually requires >= 2
            raise ValueError("Coordinates list cannot be empty for a LineString")
        for i, point in enumerate(v):
            if len(point) != 2:
                raise ValueError(
                    f"Each point in coordinates must contain exactly two values: [longitude, latitude]. Error at index {i}"
                )
            lon, lat = point
            if not (-180 <= lon <= 180):
                raise ValueError(
                    f"Longitude must be between -180 and 180. Error at index {i}"
                )
            if not (-90 <= lat <= 90):
                raise ValueError(
                    f"Latitude must be between -90 and 90. Error at index {i}"
                )
        return v


class Stop(Document):
    """
    Represents a GTFS stop or station (from stops.txt).
    Designed for geospatial queries using MongoDB's features.
    """

    stop_id: str
    stop_code: Optional[str] = None
    stop_name: Optional[str] = None  # Index for searching by name
    stop_desc: Optional[str] = None

    location: Optional[PointGeometry] = None  # Derived from stop_lat, stop_lon
    zone_id: Optional[str] = None
    stop_url: Optional[str] = None
    location_type: Optional[LocationType] = LocationType.STOP

    # parent_station can be used to link stations and stops.
    # Using the stop_id string for linking is flexible.
    parent_station_id: Optional[str] = None  # References stop_id of parent
    stop_timezone: Optional[str] = None
    wheelchair_boarding: Optional[WheelchairBoarding] = WheelchairBoarding.NO_INFO
    level_id: Optional[str] = None
    platform_code: Optional[str] = None

    class Settings:
        name = "stops"
        indexes = [
            pymongo.IndexModel(
                [
                    ("location", pymongo.GEOSPHERE)
                ],  # Use GEOSPHERE for Point data on sphere
                name="location_geosphere_idx",
            ),
            pymongo.IndexModel([("stop_id", pymongo.ASCENDING)], unique=True),
            pymongo.IndexModel([("stop_code", pymongo.ASCENDING)]),
            pymongo.IndexModel([("stop_name", pymongo.ASCENDING)]),
            pymongo.IndexModel([("parent_station_id", pymongo.ASCENDING)]),
        ]


class Route(Document):
    """
    Represents a GTFS route (from routes.txt).
    Kept relatively simple; relationships to Trips/Shapes are often better
    handled via linking or embedding within the Trip model (not shown here).
    """

    route_id: str
    agency_id: Optional[str] = None  # Links to an Agency collection
    route_short_name: Optional[str] = None
    route_long_name: Optional[str] = None
    route_desc: Optional[str] = None
    route_type: RouteType
    route_url: Optional[str] = None
    route_color: Optional[str] = None
    route_text_color: Optional[str] = None
    route_sort_order: Optional[int] = None
    continuous_pickup: Optional[ContinuousPickupDropOff] = ContinuousPickupDropOff.NONE
    continuous_drop_off: Optional[ContinuousPickupDropOff] = (
        ContinuousPickupDropOff.NONE
    )

    class Settings:
        name = "routes"
        indexes = [
            pymongo.IndexModel([("route_id", pymongo.ASCENDING)], unique=True),
            pymongo.IndexModel([("agency_id", pymongo.ASCENDING)]),
            pymongo.IndexModel([("route_short_name", pymongo.TEXT)]),
            pymongo.IndexModel([("route_long_name", pymongo.TEXT)]),
        ]


class Shape(Document):
    """
    Represents a complete GTFS shape (derived from shapes.txt).
    Leverages NoSQL by storing the entire shape geometry as one LineString,
    making it efficient to retrieve a shape's path.
    """

    shape_id: str

    # Embed the entire geometry as a GeoJSON LineString
    geometry: LineStringGeometry

    # Store the sequence of distances traveled, parallel to the geometry coordinates
    # This preserves the shape_dist_traveled info from shapes.txt
    distances_traveled: Optional[List[Optional[float]]] = (
        None  # Array of distances corresponding to each point
    )

    class Settings:
        name = "shapes"
        indexes = [
            # NOTE: Must index geometry here since it's of LineStringGeometry
            pymongo.IndexModel(
                [
                    ("geometry", pymongo.GEOSPHERE)
                ],  # Use GEOSPHERE for LineString data on sphere
                name="geometry_geosphere_idx",
            ),
            pymongo.IndexModel([("shape_id", pymongo.ASCENDING)], unique=True),
        ]
