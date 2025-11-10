"""
IMPORTANT:
1. The use of `Indexed()` is forbidden in Beanie in order for
   `pydantic_to_ts` to work correctly. All indexes must be
   defined in the Settings class of each model.

2. The use of `Link()` is forbidden in Beanie because Beanie
   uses DBRef for linking. We want to use ObjectId (implicit collection)
   for referencing documents to better support cross stack DB access.
"""

from datetime import datetime, timezone
from typing import List, Literal, Optional


from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field, field_validator, model_validator
import pymongo

from models.enums import (
    AlertCause,
    AlertEffect,
    AlertSeverity,
    CalendarExceptionType,
    CongestionLevel,
    Direction,
    LocationType,
    OccupancyStatus,
    PickupDropOff,
    RouteType,
    StopTimeUpdateScheduleRelationship,
    Timepoint,
    TripInstanceState,
    VehicleStopStatus,
    WheelchairBoarding,
)


# --- Utility functions ---


def _now_utc():
    return datetime.now(timezone.utc)


# --- Helper Models ---


class PointGeometry(BaseModel):
    """Represents a GeoJSON Point object."""

    type: Literal["Point"] = Field(default="Point", frozen=True)
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

    type: Literal["LineString"] = Field(default="LineString", frozen=True)
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


# --- Models ---


class Agency(Document):
    agency_id: str
    source_agency_id: str
    agency_name: str
    agency_url: str
    agency_timezone: str
    agency_lang: Optional[str] = None
    agency_phone: Optional[str] = None
    agency_fare_url: Optional[str] = None
    agency_email: Optional[str] = None

    class Settings:
        name = "agencies"
        indexes = [
            pymongo.IndexModel(
                [("agency_id", pymongo.ASCENDING)],
                unique=True,
                name="agency_id_unique_idx",
            )
        ]


class FeedInfo(Document):
    feed_hash: str
    agency_id: str
    feed_publisher_name: Optional[str] = None
    feed_publisher_url: Optional[str] = None
    feed_lang: Optional[str] = None
    feed_version: Optional[str] = None
    feed_start_date: Optional[str] = None  # YYYYMMDD
    feed_end_date: Optional[str] = None  # YYYYMMDD

    class Settings:
        name = "feed_info"
        indexes = [
            pymongo.IndexModel(
                [("feed_hash", pymongo.ASCENDING)],
                unique=True,
                name="feed_hash_unique_idx",
            )
        ]


class CalendarDate(Document):
    agency_id: str
    service_id: str
    date: str  # YYYYMMDD
    exception_type: CalendarExceptionType

    class Settings:
        name = "calendar_dates"
        indexes = [
            pymongo.IndexModel(
                [
                    ("agency_id", pymongo.ASCENDING),
                    ("service_id", pymongo.ASCENDING),
                    ("date", pymongo.ASCENDING),
                ],
                unique=True,
                name="calendar_date_unique_idx",
            )
        ]


class Route(Document):
    agency_id: str
    route_id: str

    route_short_name: Optional[str] = None
    route_long_name: Optional[str] = None
    route_type: RouteType
    route_color: Optional[str] = None
    route_text_color: Optional[str] = None

    class Settings:
        name = "routes"
        indexes = [
            pymongo.IndexModel(
                [("agency_id", pymongo.ASCENDING), ("route_id", pymongo.ASCENDING)],
                unique=True,
                name="route_unique_idx",
            ),
            pymongo.IndexModel(
                [("route_id", pymongo.ASCENDING)],
                name="route_id_idx",
            ),
        ]


class Trip(Document):
    agency_id: str
    trip_id: str

    route_id: str
    service_id: str
    trip_headsign: Optional[str] = None
    trip_short_name: Optional[str] = None
    direction_id: Optional[Direction] = None
    block_id: Optional[str] = None
    shape_id: Optional[str] = None

    class Settings:
        name = "trips"
        indexes = [
            pymongo.IndexModel(
                [("agency_id", pymongo.ASCENDING), ("trip_id", pymongo.ASCENDING)],
                unique=True,
                name="trip_unique_idx",
            ),
            pymongo.IndexModel(
                [("trip_id", pymongo.ASCENDING)],
                name="trip_id_idx",
            ),
        ]


class Stop(Document):
    agency_id: str
    stop_id: str

    stop_code: Optional[str] = None
    stop_name: Optional[str] = None
    stop_desc: Optional[str] = None
    location: Optional[PointGeometry] = None  # Derived from stop_lat, stop_lon
    zone_id: Optional[str] = None
    stop_url: Optional[str] = None
    location_type: Optional[LocationType] = None
    parent_station: Optional[str] = None
    stop_timezone: Optional[str] = None
    wheelchair_boarding: Optional[WheelchairBoarding] = None

    class Settings:
        name = "stops"
        indexes = [
            pymongo.IndexModel(
                [("agency_id", pymongo.ASCENDING), ("stop_id", pymongo.ASCENDING)],
                unique=True,
                name="stop_unique_idx",
            ),
            pymongo.IndexModel(
                [("stop_id", pymongo.ASCENDING)],
                name="stop_id_idx",
            ),
            pymongo.IndexModel(
                [
                    ("location", pymongo.GEOSPHERE)
                ],  # Use GEOSPHERE for Point data on sphere
                name="location_geosphere_idx",
            ),
        ]


class StopTime(Document):
    agency_id: str
    trip_id: str
    arrival_time: str  # "HH:MM:SS" (hours may exceed 24)
    departure_time: str
    stop_id: Optional[str] = None
    stop_sequence: int
    stop_headsign: Optional[str] = None
    pickup_type: Optional[PickupDropOff] = None
    drop_off_type: Optional[PickupDropOff] = None
    timepoint: Timepoint
    shape_dist_traveled: Optional[float] = None

    class Settings:
        name = "stop_times"
        indexes = [
            pymongo.IndexModel(
                [
                    ("agency_id", pymongo.ASCENDING),
                    ("trip_id", pymongo.ASCENDING),
                    ("stop_sequence", pymongo.ASCENDING),
                ],
                unique=True,
                name="stop_time_unique_idx",
            ),
        ]


class Shape(Document):
    """
    Represents a complete GTFS shape (derived from shapes.txt).
    Leverages NoSQL by storing the entire shape geometry as one LineString,
    making it efficient to retrieve a shape's path.
    """

    agency_id: str
    shape_id: str

    # Embed the entire geometry as a GeoJSON LineString
    geometry: LineStringGeometry

    # Store the sequence of distances traveled, parallel to the geometry coordinates
    distances_traveled: Optional[List[float]] = (
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
                [("shape_id", pymongo.ASCENDING), ("agency_id", pymongo.ASCENDING)],
                unique=True,
                name="shape_unique_idx",
            ),
        ]


# NOTE: GTFS RT TripDescriptor directly maps to TripInstance.
#       Therefore, we do not create and store separate TripDescriptor documents.


class VehiclePosition(Document):
    agency_id: str
    vehicle_id: str
    timestamp: datetime = Field(default_factory=_now_utc)

    stop_id: Optional[str]
    current_stop_sequence: Optional[int]
    current_status: Optional[VehicleStopStatus]
    congestion_level: Optional[CongestionLevel]
    occupancy_status: Optional[OccupancyStatus]
    occupancy_percentage: Optional[int]
    latitude: Optional[float]
    longitude: Optional[float]
    bearing: Optional[float]
    odometer: Optional[float]
    speed: Optional[float]  # meters per second

    ingested_at: datetime = Field(default_factory=_now_utc)

    trip_instance: Optional[PydanticObjectId] = None  # ObjectId of TripInstance

    class Settings:
        name = "vehicle_positions"
        indexes = [
            pymongo.IndexModel(
                [
                    ("agency_id", pymongo.ASCENDING),
                    ("vehicle_id", pymongo.ASCENDING),
                    ("timestamp", pymongo.ASCENDING),
                ],
                unique=True,
                name="vehicle_position_unique_idx",
            ),
            pymongo.IndexModel(
                [
                    ("_id", pymongo.ASCENDING),
                    ("current_stop_sequence", pymongo.ASCENDING),
                ],
                name="position_lookup_idx",
            ),
        ]


class Vehicle(Document):
    agency_id: str
    vehicle_id: str
    label: Optional[str] = None
    license_plate: Optional[str] = None
    wheelchair_accessible: Optional[WheelchairBoarding] = None

    positions: List[PydanticObjectId] = Field(
        default_factory=list
    )  # ObjectId of VehiclePosition

    class Settings:
        name = "vehicles"
        indexes = [
            pymongo.IndexModel(
                [("agency_id", pymongo.ASCENDING), ("vehicle_id", pymongo.ASCENDING)],
                unique=True,
                name="vehicle_unique_idx",
            )
        ]


class EntitySelector(BaseModel):
    agency_id: Optional[str] = None
    route_id: Optional[str] = None
    route_type: Optional[RouteType] = None
    direction_id: Optional[Direction] = None
    trip_instance: Optional[PydanticObjectId] = None  # ObjectId of TripInstance
    stop_id: Optional[str] = None


class TimeRange(BaseModel):
    start: Optional[datetime] = None
    end: Optional[datetime] = None


class Translation(BaseModel):
    language: str
    text: str


class Alert(Document):
    agency_id: str  # The agency issuing the alert
    content_hash: str

    cause: AlertCause = AlertCause.UNKNOWN_CAUSE
    effect: AlertEffect = AlertEffect.UNKNOWN_EFFECT
    header_text: List[Translation] = Field(default_factory=list)
    description_text: List[Translation] = Field(default_factory=list)
    url: List[Translation] = Field(default_factory=list)
    severity_level: AlertSeverity = AlertSeverity.UNKNOWN_SEVERITY
    active_periods: List[TimeRange] = Field(default_factory=list)
    informed_entities: List[EntitySelector] = Field(default_factory=list)

    last_seen: datetime = Field(default_factory=_now_utc)

    class Settings:
        name = "alerts"
        indexes = [
            pymongo.IndexModel(
                [
                    ("content_hash", pymongo.ASCENDING),
                ],
                unique=True,
                name="alert_unique_idx",
            ),
            # Index for querying by active period time ranges
            pymongo.IndexModel(
                [
                    ("active_periods.start", pymongo.ASCENDING),
                    ("active_periods.end", pymongo.ASCENDING),
                ],
                name="active_periods_idx",
            ),
            # Individual indexes for each informed_entities field to support any combination
            pymongo.IndexModel(
                [
                    ("informed_entities.agency_id", pymongo.ASCENDING),
                ],
                name="informed_entities_agency_idx",
            ),
            pymongo.IndexModel(
                [
                    ("informed_entities.route_id", pymongo.ASCENDING),
                ],
                name="informed_entities_route_idx",
            ),
            pymongo.IndexModel(
                [
                    ("informed_entities.route_type", pymongo.ASCENDING),
                ],
                name="informed_entities_route_type_idx",
            ),
            pymongo.IndexModel(
                [
                    ("informed_entities.direction_id", pymongo.ASCENDING),
                ],
                name="informed_entities_direction_idx",
            ),
            pymongo.IndexModel(
                [
                    ("informed_entities.trip_instance", pymongo.ASCENDING),
                ],
                name="informed_entities_trip_idx",
            ),
            pymongo.IndexModel(
                [
                    ("informed_entities.stop_id", pymongo.ASCENDING),
                ],
                name="informed_entities_stop_idx",
            ),
            # Index for querying by last_seen
            pymongo.IndexModel(
                [
                    ("last_seen", pymongo.DESCENDING),
                ],
                name="last_seen_idx",
            ),
        ]


# --- Models for derived data ---


class StopTimeInstance(BaseModel):
    stop_id: str
    stop_headsign: Optional[str] = None
    pickup_type: Optional[PickupDropOff] = None
    drop_off_type: Optional[PickupDropOff] = None
    timepoint: Timepoint
    shape_dist_traveled: Optional[float] = None

    arrival_datetime: Optional[datetime] = None
    departure_datetime: Optional[datetime] = None

    predicted_arrival_datetime: Optional[datetime] = None
    predicted_departure_datetime: Optional[datetime] = None

    predicted_arrival_uncertainty: Optional[int] = None  # seconds
    predicted_departure_uncertainty: Optional[int] = None  # seconds

    schedule_relationship: Optional[StopTimeUpdateScheduleRelationship] = (
        StopTimeUpdateScheduleRelationship.SCHEDULED
    )

    @model_validator(mode="after")
    def validate_datetime(self) -> "StopTimeInstance":
        """One of arrival_datetime or departure_datetime must be set."""
        if self.arrival_datetime is None and self.departure_datetime is None:
            raise ValueError(
                "At least one of arrival_datetime or departure_datetime must be set"
            )
        return self


class TripInstance(Document):
    # Main identifying fields
    agency_id: str
    trip_id: str  # Trip ID or <Route ID>#<Direction ID> for frequency-based trips
    start_date: str  # YYYYMMDD
    start_time: str  # HH:MM:SS (Scheduled start time)

    # Alternative queryable fields for GTFS RT trip descriptor
    route_id: str
    direction_id: Optional[Direction] = None

    state: TripInstanceState = TripInstanceState.PRISTINE

    start_datetime: datetime

    stop_times: List[StopTimeInstance]

    stop_times_updated_at: datetime = Field(default_factory=_now_utc)

    trip: PydanticObjectId  # ObjectId of Trip
    route: PydanticObjectId  # ObjectId of Route
    shape: Optional[PydanticObjectId] = None  # ObjectId of Shape
    vehicle: Optional[PydanticObjectId] = None  # ObjectId of Vehicle
    positions: List[PydanticObjectId] = Field(
        default_factory=list
    )  # ObjectId of VehiclePosition

    class Settings:
        name = "trip_instances"
        indexes = [
            pymongo.IndexModel(
                [
                    ("agency_id", pymongo.ASCENDING),
                    ("trip_id", pymongo.ASCENDING),
                    ("start_date", pymongo.ASCENDING),
                    ("start_time", pymongo.ASCENDING),
                ],
                unique=True,
                name="trip_instance_unique_idx",
            ),
            # This index need not to be unique as long as an trip_id is provided (which always is).
            pymongo.IndexModel(
                [
                    ("agency_id", pymongo.ASCENDING),
                    ("route_id", pymongo.ASCENDING),
                    ("direction_id", pymongo.ASCENDING),
                    ("start_date", pymongo.ASCENDING),
                    ("start_time", pymongo.ASCENDING),
                ],
                name="trip_instance_alternate_idx",
            ),
            pymongo.IndexModel(
                [("state", pymongo.ASCENDING)],
                name="state_idx",
            ),
            pymongo.IndexModel(
                [
                    ("stop_times.stop_id", pymongo.ASCENDING),
                    ("start_datetime", pymongo.ASCENDING),
                    ("state", pymongo.ASCENDING),
                ],
                name="stop_times_lookup_optimized_idx",
            ),
            pymongo.IndexModel(
                [
                    ("stop_times.stop_id", pymongo.ASCENDING),
                    ("stop_times.departure_datetime", pymongo.ASCENDING),
                ],
                name="stop_times_departure_optimized_idx",
            ),
            pymongo.IndexModel(
                [
                    ("stop_times_updated_at", pymongo.DESCENDING),
                    ("stop_times.stop_id", pymongo.ASCENDING),
                ],
                name="realtime_filtering_idx",
            ),
            pymongo.IndexModel(
                [
                    ("stop_times.stop_id", pymongo.ASCENDING),
                    ("stop_times.stop_sequence", pymongo.ASCENDING),
                ],
                name="stop_sequence_idx",
            ),
            pymongo.IndexModel(
                [("stop_times_updated_at", pymongo.DESCENDING)],
                name="stop_times_updated_at_simple_idx",
            ),
            pymongo.IndexModel(
                [("positions", pymongo.ASCENDING)],
                name="positions_array_idx",
            ),
        ]


# --- Views ---


class RoutesByStop(Document):
    """
    *Materialized View* that aggregates routes by stop.
    Provides efficient lookup of all routes
     - passing through each stop
     - passing through a stop within 100 meters

    NOTE: We are emulating a materialize view using a regular collection because Beanie does not support it.
    """

    stop: PydanticObjectId
    routes: List[PydanticObjectId]
    agency_id: str
    stop_id: str

    @classmethod
    async def materialize_view(cls):
        await cls.delete_all()
        await cls.Settings.source.aggregate(cls.Settings.pipeline).to_list(length=None)

    class Settings:
        name = "routes_by_stop"
        source = StopTime
        pipeline = [
            # 1) Group stop-time rows into unique trip_id arrays per (agency, stop)
            {
                "$group": {
                    "_id": {"agency_id": "$agency_id", "stop_id": "$stop_id"},
                    "trip_ids": {"$addToSet": "$trip_id"},
                }
            },
            # 2) Lookup trips using localField/foreignField (index-friendly)
            #    (returns all trips whose trip_id is in trip_ids)
            {
                "$lookup": {
                    "from": "trips",
                    "localField": "trip_ids",
                    "foreignField": "trip_id",
                    "as": "trips_docs",
                }
            },
            # 3) Keep only trips for the same agency (filter in-memory; arrays are small)
            {
                "$addFields": {
                    "trips_docs": {
                        "$filter": {
                            "input": "$trips_docs",
                            "as": "t",
                            "cond": {"$eq": ["$$t.agency_id", "$_id.agency_id"]},
                        }
                    }
                }
            },
            # 4) Extract unique route_id list from trips_docs
            {
                "$addFields": {
                    "route_ids": {
                        "$setUnion": [
                            {
                                "$map": {
                                    "input": "$trips_docs",
                                    "as": "t",
                                    "in": "$$t.route_id",
                                }
                            },
                            [],
                        ]
                    }
                }
            },
            # 5) Lookup stop document(s) by stop_id (index-friendly); then filter by agency
            {
                "$lookup": {
                    "from": "stops",
                    "localField": "_id.stop_id",
                    "foreignField": "stop_id",
                    "as": "stop_info",
                }
            },
            {
                "$addFields": {
                    "stop_info": {
                        "$filter": {
                            "input": "$stop_info",
                            "as": "s",
                            "cond": {"$eq": ["$$s.agency_id", "$_id.agency_id"]},
                        }
                    }
                }
            },
            # 6) Extract the stop
            {"$addFields": {"stop": {"$arrayElemAt": ["$stop_info._id", 0]}}},
            # 7) Drop entries where the stop lookup failed
            {"$match": {"stop": {"$ne": None}}},
            # 8) Lookup route documents by route_id array (index-friendly)
            {
                "$lookup": {
                    "from": "routes",
                    "localField": "route_ids",
                    "foreignField": "route_id",
                    "as": "route_objects",
                }
            },
            # 9) Keep only routes that belong to the same agency (filter in-memory)
            {
                "$addFields": {
                    "route_objects": {
                        "$filter": {
                            "input": "$route_objects",
                            "as": "r",
                            "cond": {"$eq": ["$$r.agency_id", "$_id.agency_id"]},
                        }
                    }
                }
            },
            # 10) Final projection: stop ObjectId, array of route ObjectIds, agency/stop id strings
            {
                "$project": {
                    "_id": 0,
                    "stop": "$stop",
                    "routes": {
                        "$setUnion": [
                            {
                                "$map": {
                                    "input": "$route_objects",
                                    "as": "r",
                                    "in": "$$r._id",
                                }
                            },
                            [],
                        ]
                    },
                    "agency_id": "$_id.agency_id",
                    "stop_id": "$_id.stop_id",
                }
            },
            # 11) Materialize the view
            {
                "$merge": {
                    "into": "routes_by_stop",
                    "on": ["agency_id", "stop_id"],
                    "whenMatched": "replace",
                    "whenNotMatched": "insert",
                }
            },
        ]

        # Indexes for the view (MongoDB 5.3+)
        indexes = [
            pymongo.IndexModel(
                [("stop", pymongo.ASCENDING)], unique=True, name="stop_object_id_idx"
            ),
            pymongo.IndexModel(
                [("agency_id", pymongo.ASCENDING), ("stop_id", pymongo.ASCENDING)],
                unique=True,
                name="stop_lookup_idx",
            ),
        ]
