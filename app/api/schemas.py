from typing import Optional
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
