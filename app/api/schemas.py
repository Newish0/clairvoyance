from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel


class AgencyResponse(BaseModel):
    id: str
    name: str
    static_gtfs_url: str
    realtime_gtfs_url: str

    class Config:
        from_attributes = True


class RouteResponse(BaseModel):
    id: str
    agency_id: str
    route_short_name: str
    route_long_name: str
    route_type: int

    class Config:
        from_attributes = True


class TripInfo(BaseModel):
    id: str
    service_id: str
    trip_headsign: str
    trip_short_name: str
    direction_id: int
    shape_id: Optional[str]


class RouteInfo(BaseModel):
    id: str
    short_name: str
    long_name: str
    type: int


class StopInfo(BaseModel):
    id: str
    name: str
    lat: float
    lon: float


class StopTimeInfo(BaseModel):
    trip_id: str
    arrival_time: str
    departure_time: str
    continuous_pickup: int
    continuous_drop_off: int
    is_last: bool
    arrival_delay: Optional[int] = None
    departure_delay: Optional[int] = None


class NearbyResponse(BaseModel):
    route: RouteInfo
    trip: TripInfo
    stop: StopInfo
    stop_time: StopTimeInfo

    class Config:
        from_attributes = True


# class RealtimeUpdateResponse(BaseModel):
#     trip_id: str
#     stop_id: int
#     arrival_delay: Optional[int]
#     departure_delay: Optional[int]
#     timestamp: datetime
#     vehicle_id: Optional[str]
#     current_status: Optional[str]

#     class Config:
#         from_attributes = True


class ShapePoint(BaseModel):
    lat: float
    lon: float
    sequence: int
    dist_traveled: Optional[float]

    class Config:
        from_attributes = True


class TripShapeResponse(BaseModel):
    trip_id: str
    shape_points: List[ShapePoint]

    class Config:
        from_attributes = True


class RouteStopTimeResponse(BaseModel):
    trip_id: str
    arrival_time: str
    departure_time: str
    trip_headsign: str
    realtime_arrival_delay: Optional[int] = None
    realtime_departure_delay: Optional[int] = None
    realtime_timestamp: Optional[datetime] = None

    class Config:
        from_attributes = True


class RouteDetailsResponse(BaseModel):
    id: str
    agency_id: str
    short_name: str
    long_name: str
    description: Optional[str]
    route_type: int
    url: Optional[str]
    color: Optional[str]
    text_color: Optional[str]
    sort_order: Optional[int]
    continuous_pickup: Optional[int]
    continuous_drop_off: Optional[int]

    class Config:
        from_attributes = True


class TripDetailsResponse(BaseModel):
    id: str
    route_id: str
    service_id: str
    headsign: str
    short_name: str
    direction_id: int
    block_id: Optional[str]
    shape_id: Optional[str]
    wheelchair_accessible: Optional[int]
    bikes_allowed: Optional[int]
    current_status: Optional[str] = None
    current_delay: Optional[int] = None
    last_updated: Optional[datetime] = None

    class Config:
        from_attributes = True


class VehiclePositionResponse(BaseModel):
    vehicle_id: str
    trip_id: Optional[str]
    route_id: str
    latitude: float
    longitude: float
    current_stop_id: Optional[str]
    current_status: Optional[str]
    timestamp: datetime
    bearing: Optional[float]
    speed: Optional[float]
    congestion_level: Optional[str]
    occupancy_status: Optional[str]
    current_stop_sequence: Optional[int]

    class Config:
        from_attributes = True
