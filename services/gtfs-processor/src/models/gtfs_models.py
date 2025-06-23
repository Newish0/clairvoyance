"""
IMPORTANT: The use of `Indexed()` is forbidden in Beanie in order for
           `pydantic_to_ts` to work correctly. All indexes must be
           defined in the Settings class of each model.
"""

import datetime
import re
from typing import Dict, List, Optional, Tuple, Any

import pytz
from beanie import Document, Update, ValidateOnSave, before_event
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
from models.gtfs_enums import (
    AlertCause,
    AlertEffect,
    AlertSeverityLevel,
    CongestionLevel,
    StopTimeUpdateScheduleRelationship,
    VehicleWheelchairAccessible,
)


# --- Sub-models ---
class StopTimeInfo(BaseModel):
    stop_id: str
    stop_sequence: int
    stop_headsign: Optional[str] = None
    pickup_type: Optional[int] = None
    drop_off_type: Optional[int] = None
    # TODO: Add other fields per GTFS StopTime specs...
    shape_dist_traveled: Optional[float] = None

    # Derived fields from static GTFS arrival_time and departure_time
    arrival_datetime: datetime.datetime
    departure_datetime: datetime.datetime

    # If no realtime data is available, set the schedule relationship to SCHEDULED
    schedule_relationship: Optional[StopTimeUpdateScheduleRelationship] = None

    # --- REALTIME FIELDS ---
    predicted_arrival_datetime: Optional[datetime.datetime] = None
    predicted_departure_datetime: Optional[datetime.datetime] = None

    predicted_arrival_uncertainty: Optional[int] = None  # seconds
    predicted_departure_uncertainty: Optional[int] = None  # seconds

    # --- REALTIME DERIVED FIELDS ---
    arrival_delay: Optional[int] = None  # seconds
    departure_delay: Optional[int] = None  # seconds


class Position(BaseModel):
    latitude: float
    longitude: float
    timestamp: datetime.datetime  # Expecting timezone-aware UTC
    bearing: Optional[float] = None
    speed: Optional[float] = None  # meters per second


class Vehicle(BaseModel):
    vehicle_id: Optional[str] = None
    label: Optional[str] = None
    license_plate: Optional[str] = None
    wheelchair_accessible: Optional[VehicleWheelchairAccessible] = None


class TripVehicleHistory(BaseModel):
    timestamp: datetime.datetime
    position: Position
    congestion_level: Optional[CongestionLevel]
    occupancy_status: Optional[OccupancyStatus]


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

    stop_times: List[StopTimeInfo] = Field(default_factory=list)
    current_stop_sequence: Optional[int] = None

    # The exact status of the vehicle with respect to the current stop.
    # Ignored if current_stop_sequence is missing.
    current_status: Optional[VehicleStopStatus] = None

    schedule_relationship: TripDescriptorScheduleRelationship = (
        TripDescriptorScheduleRelationship.SCHEDULED
    )

    vehicle: Optional[Vehicle] = None

    current_occupancy: Optional[OccupancyStatus] = None
    current_congestion: Optional[CongestionLevel] = None

    current_position: Optional[Position] = None
    history: List[TripVehicleHistory] = Field(default_factory=list)

    stop_times_updated_at: Optional[datetime.datetime] = (
        None  # TZ-aware UTC, index for recency queries
    )
    position_updated_at: Optional[datetime.datetime] = (
        None  # TZ-aware UTC, index for recency queries
    )

    # --- Derived & Persisted Fields - For query efficiency ---
    # These fields are calculated *before* saving using the validator below.
    start_datetime: datetime.datetime

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

    class Settings:
        name = "scheduled_trips"
        use_revision = True
        indexes = [
            # Compound index for unique scheduled trip instance lookup using trip_id
            pymongo.IndexModel(
                [
                    ("trip_id", pymongo.ASCENDING),
                    ("start_date", pymongo.ASCENDING),
                    ("start_time", pymongo.ASCENDING),
                ],
                unique=True,
                name="unique_trip_instance_idx",
            ),
            # TODO: Compound index for unique scheduled trip instance lookup using
            #       route_id + direction_id + start_date + start_time
            #
            # Indexes to speed up next trips queries
            pymongo.IndexModel(
                [("stop_times.stop_id", pymongo.ASCENDING)],
                name="stop_times_stop_id_idx",
            ),
            pymongo.IndexModel(
                [("stop_times.arrival_datetime", pymongo.ASCENDING)],
                name="stop_times_arrival_datetime_idx",
            ),
            pymongo.IndexModel(
                [("stop_times.departure_datetime", pymongo.ASCENDING)],
                name="stop_times_departure_datetime_idx",
            ),
            pymongo.IndexModel([("trip_id", pymongo.ASCENDING)], name="trip_id_idx"),
            pymongo.IndexModel([("route_id", pymongo.ASCENDING)], name="route_id_idx"),
            pymongo.IndexModel(
                [("direction_id", pymongo.ASCENDING)], name="direction_id_idx"
            ),
            pymongo.IndexModel(
                [("vehicle.vehicle_id", pymongo.ASCENDING)], name="vehicle_id_idx"
            ),
            pymongo.IndexModel(
                [("stop_times_updated_at", pymongo.DESCENDING)],
                name="stop_times_updated_at_idx",
            ),
            pymongo.IndexModel(
                [("position_updated_at_at", pymongo.DESCENDING)],
                name="position_updated_at_at_idx",
            ),
            pymongo.IndexModel(
                [("start_datetime", pymongo.DESCENDING)], name="start_datetime_idx"
            ),
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
        use_revision = True
        indexes = [
            pymongo.IndexModel(
                [
                    ("location", pymongo.GEOSPHERE)
                ],  # Use GEOSPHERE for Point data on sphere
                name="location_geosphere_idx",
            ),
            pymongo.IndexModel(
                [("stop_id", pymongo.ASCENDING)],
                unique=True,
                name="stop_id_unique_idx",
            ),
            pymongo.IndexModel(
                [("stop_code", pymongo.ASCENDING)], name="stop_code_idx"
            ),
            pymongo.IndexModel(
                [("stop_name", pymongo.ASCENDING)], name="stop_name_idx"
            ),
            pymongo.IndexModel(
                [("parent_station_id", pymongo.ASCENDING)],
                name="parent_station_id_idx",
            ),
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
        use_revision = True
        indexes = [
            pymongo.IndexModel(
                [("route_id", pymongo.ASCENDING)],
                unique=True,
                name="route_id_unique_idx",
            ),
            pymongo.IndexModel(
                [("agency_id", pymongo.ASCENDING)], name="agency_id_idx"
            ),
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
        use_revision = True
        indexes = [
            # NOTE: Must index geometry here since it's of LineStringGeometry
            pymongo.IndexModel(
                [
                    ("geometry", pymongo.GEOSPHERE)
                ],  # Use GEOSPHERE for LineString data on sphere
                name="geometry_geosphere_idx",
            ),
            pymongo.IndexModel(
                [("shape_id", pymongo.ASCENDING)],
                unique=True,
                name="shape_id_unique_idx",
            ),
        ]


class TimeRange(BaseModel):
    """Represents a period of time."""

    start: Optional[datetime.datetime] = None  # POSIX time, seconds since 1/1/1970
    end: Optional[datetime.datetime] = None  # POSIX time, seconds since 1/1/1970


class Translation(BaseModel):
    """A single translation of a string into a specific language."""

    text: str
    language: str  # BCP-47 language code


class TripDescriptor(BaseModel):
    """Describes a specific trip."""

    trip_id: Optional[str] = None
    start_time: Optional[str] = None  # HH:MM:SS, can be >24:00:00
    start_date: Optional[str] = None  # YYYYMMDD

    route_id: Optional[str] = None
    direction_id: Optional[int] = None  # 0 or 1


class EntitySelector(BaseModel):
    """Selects a GTFS entity."""

    agency_id: Optional[str] = None
    route_id: Optional[str] = None
    route_type: Optional[int] = None  # See GTFS route_type documentation
    trip: Optional[TripDescriptor] = None
    stop_id: Optional[str] = None  # GTFS stop_id
    # direction_id from GTFS-RT extension:
    # Specifies the direction for the given route_id.
    # This is different from trip.direction_id as trip is more specific.
    direction_id: Optional[int] = None


class Alert(Document):
    """
    A Beanie model for storing GTFS Alerts.
    Based on GTFS Realtime feed Message -> FeedEntity -> Alert
    """

    # The entity id of the alert.
    # Useful for tracking alert over time.
    producer_alert_id: Optional[str] = Field(default=None, index=True)

    # This is required to identify if alert is still in effect
    # based on whether that agency is still sending this alert.
    agency_id: str

    active_periods: List[TimeRange] = Field(default_factory=list)
    informed_entities: List[EntitySelector] = Field(default_factory=list)

    cause: AlertCause = Field(default=AlertCause.UNKNOWN_CAUSE)
    effect: AlertEffect = Field(default=AlertEffect.UNKNOWN_EFFECT)

    url: Optional[List[Translation]] = None
    header_text: Optional[List[Translation]] = None
    description_text: Optional[List[Translation]] = None

    severity_level: Optional[AlertSeverityLevel] = Field(
        default=AlertSeverityLevel.UNKNOWN_SEVERITY
    )

    # GTFS Realtime v2.1 extensions (added image, cause_detail, effect_detail)
    # TODO: Maybe include these experimental fields in the future.
    # image: Optional[TranslatedStringModel] = None
    # image_alternative_text: Optional[TranslatedStringModel] = (
    #     None  # Alt text for the image
    # )
    # cause_detail: Optional[TranslatedStringModel] = None
    # effect_detail: Optional[TranslatedStringModel] = None

    # Timestamps for managing the document itself
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.now)
    updated_at: datetime.datetime = Field(default_factory=datetime.datetime.now)

    class Settings:
        name = "alerts"
        use_revision = True
        indexes = [
            pymongo.IndexModel(
                [("producer_alert_id", pymongo.ASCENDING)],
                name="idx_producer_alert_id",
                unique=True,
            ),
            pymongo.IndexModel(
                [
                    ("active_periods.start", pymongo.ASCENDING),
                    ("active_periods.end", pymongo.ASCENDING),
                ],
                name="idx_active_period_start_active_period_end",
            ),
            pymongo.IndexModel(
                [("informed_entity.agency_id", pymongo.ASCENDING)],
                name="idx_informed_entity_agency_id",
            ),
            pymongo.IndexModel(
                [("informed_entity.route_id", pymongo.ASCENDING)],
                name="idx_informed_entity_route_id",
            ),
            pymongo.IndexModel(
                [("informed_entity.stop_id", pymongo.ASCENDING)],
                name="idx_informed_entity_stop_id",
            ),
            pymongo.IndexModel(
                [("informed_entity.trip.trip_id", pymongo.ASCENDING)],
                name="idx_informed_entity_trip_trip_id",
            ),
            pymongo.IndexModel([("cause", pymongo.ASCENDING)], name="idx_cause"),
            pymongo.IndexModel([("effect", pymongo.ASCENDING)], name="idx_effect"),
            pymongo.IndexModel(
                [("severity_level", pymongo.ASCENDING)], name="idx_severity_level"
            ),
            pymongo.IndexModel(
                [("updated_at", pymongo.DESCENDING)], name="idx_updated_at_desc"
            ),  # For fetching latest updates
        ]


class FeedInfo(BaseModel):
    """
    A Beanie model for storing GTFS FeedHistory.
    """

    # TODO: Include these fields once we have proper parsing of feed_info.txt
    # publisher_name: str
    # publisher_url: str
    # lang: str
    # version: str
    # start_date: Optional[datetime.datetime]
    # end_date: Optional[datetime.datetime]

    data_hash: str


class Agency(Document):
    """
    A Beanie model for storing GTFS Agencies.
    """

    agency_id: str
    config_agency_id: str  # This will be the ID used in the GTFS Config JSON
    name: str
    url: str
    timezone: str
    lang: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    imported_feeds: Optional[List[FeedInfo]] = None
    
    class Settings:
        name = "agencies"
        use_revision = True
