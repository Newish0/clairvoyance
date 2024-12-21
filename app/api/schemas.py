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

class RealtimeUpdateResponse(BaseModel):
    trip_id: str
    stop_id: int
    arrival_delay: Optional[int]
    departure_delay: Optional[int]
    timestamp: datetime
    vehicle_id: Optional[str]
    current_status: Optional[str]

    class Config:
        from_attributes = True 