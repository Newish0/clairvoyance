from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import logging

from app.core.database import get_db
from app.api.schemas import (
    AgencyResponse,
    NearbyResponse,
    RouteResponse,
    TripShapeResponse,
    RouteStopTimeResponse,
    RouteDetailsResponse,
    TripDetailsResponse,
    TripStopResponse,
    VehiclePositionResponse,
)

from app.services import (
    nearby_service,
    agency_service,
    route_service,
    trip_service,
    vehicle_service,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", tags=["root"])
def read_root():
    return {"message": "Welcome to GTFS API", "version": "1.0.0"}


@router.get("/nearby", response_model=List[NearbyResponse], tags=["nearby"])
def get_nearby(
    db: Session = Depends(get_db),
    lat: float = 48.468282,
    lon: float = -123.376255,
    radius: float = Query(
        0.5, description="Search radius in kilometers", ge=0.1, le=5.0
    ),
    current_time: Optional[str] = Query(
        None,
        description="Current time in HH:MM:SS format. Defaults to current time if not provided",
    ),
    current_date: Optional[str] = Query(
        None,
        description="Current date in YYYYMMDD format. Defaults to current date if not provided",
    ),
):
    """
    Get nearby stops and their routes within a specified radius.
    Returns unique routes with their closest stops for each direction to the given location and next departure times.
    Only returns trips that are operating on the specified date.
    """
    try:
        if current_time is None:
            current_time = datetime.now().strftime("%H:%M:%S")
        if current_date is None:
            current_date = datetime.now().strftime("%Y%m%d")

        return nearby_service.get_nearby_stops_and_routes(
            db=db,
            lat=lat,
            lon=lon,
            radius=radius,
            current_time=current_time,
            current_date=current_date,
        )
    except Exception as e:
        logger.error(f"Error in get_nearby endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/agencies", response_model=List[AgencyResponse], tags=["agencies"])
def get_agencies(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    """Get all transit agencies with pagination support."""
    try:
        return agency_service.get_agencies(db=db, skip=skip, limit=limit)
    except Exception as e:
        logger.error(f"Error in get_agencies endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/agencies/{agency_id}", response_model=AgencyResponse, tags=["agencies"])
def get_agency(agency_id: str, db: Session = Depends(get_db)):
    """Get details for a specific transit agency."""
    try:
        agency = agency_service.get_agency_by_id(db=db, agency_id=agency_id)
        if agency is None:
            raise HTTPException(status_code=404, detail="Agency not found")
        return agency
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_agency endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/agencies/{agency_id}/routes", response_model=List[RouteResponse], tags=["routes"]
)
def get_agency_routes(
    agency_id: str,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    """Get routes for a specific transit agency with pagination support."""
    try:
        routes = route_service.get_agency_routes(
            db=db, agency_id=agency_id, skip=skip, limit=limit
        )
        if not routes:
            raise HTTPException(
                status_code=404, detail="No routes found for this agency"
            )
        return routes
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_agency_routes endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/trips/{trip_id}/shapes",
    response_model=TripShapeResponse,
    tags=["trips", "shapes"],
)
def get_trip_shape(trip_id: str, db: Session = Depends(get_db)):
    """Get the shape points for a specific trip, ordered by sequence number."""
    try:
        shape = trip_service.get_trip_shape(db=db, trip_id=trip_id)
        if shape is None:
            raise HTTPException(status_code=404, detail="Trip or shape not found")
        return shape
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_trip_shape endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/trips/{trip_id}/stops",
    response_model=List[TripStopResponse],
    tags=["trips", "stop_times"],
)
def get_trip_stops(trip_id: str, db: Session = Depends(get_db)):
    """Get the stops & stop times for a specific trip, ordered by stop sequence number."""
    try:
        stops = trip_service.get_trip_stops(db=db, trip_id=trip_id)
        if not stops:
            raise HTTPException(status_code=404, detail="No stop times found")
        return stops
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_trip_stops endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/routes/{route_id}/stops/{stop_id}/times",
    response_model=List[RouteStopTimeResponse],
    tags=["routes", "stops"],
)
def get_route_stop_times(
    route_id: str,
    stop_id: str,
    db: Session = Depends(get_db),
    current_time: Optional[str] = Query(
        None,
        description="Current time in HH:MM:SS format. Defaults to current time if not provided",
    ),
    current_date: Optional[str] = Query(
        None,
        description="Current date in YYYYMMDD format. Defaults to current date if not provided",
    ),
):
    """
    Get all stop times for a specific route at a specific stop.
    Returns times sorted by departure time, with realtime delay information when available.
    Only returns trips that are operating on the specified date.
    """
    try:
        if current_time is None:
            current_time = datetime.now().strftime("%H:%M:%S")
        if current_date is None:
            current_date = datetime.now().strftime("%Y%m%d")

        times = route_service.get_route_stop_times(
            db=db,
            route_id=route_id,
            stop_id=stop_id,
            current_time=current_time,
            current_date=current_date,
        )
        if not times:
            raise HTTPException(
                status_code=404,
                detail="No stop times found for this route and stop combination",
            )
        return times
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_route_stop_times endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/routes/{route_id}", response_model=RouteDetailsResponse, tags=["routes"])
def get_route_details(route_id: str, db: Session = Depends(get_db)):
    """Get detailed information about a specific route."""
    try:
        route = route_service.get_route_details(db=db, route_id=route_id)
        if route is None:
            raise HTTPException(status_code=404, detail="Route not found")
        return route
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_route_details endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/trips/{trip_id}", response_model=TripDetailsResponse, tags=["trips"])
def get_trip_details(trip_id: str, db: Session = Depends(get_db)):
    """Get detailed information about a specific trip, including any current realtime status."""
    try:
        trip = trip_service.get_trip_details(db=db, trip_id=trip_id)
        if trip is None:
            raise HTTPException(status_code=404, detail="Trip not found")
        return trip
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_trip_details endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/routes/{route_id}/vehicles",
    response_model=List[VehiclePositionResponse],
    tags=["routes", "vehicles"],
)
def get_route_vehicles(
    route_id: str,
    db: Session = Depends(get_db),
    max_age: int = Query(
        300, description="Maximum age of vehicle positions in seconds", ge=60, le=3600
    ),
    direction_id: Optional[int] = Query(
        None,
        description="Filter vehicles by direction (0 or 1)",
        ge=0,
        le=1,
    ),
):
    """
    Get current positions of all vehicles operating on a specific route.
    Returns the latest position for each unique vehicle within the specified max_age.
    Optionally filter by direction_id (0 or 1) if provided.
    """
    try:
        vehicles = vehicle_service.get_route_vehicles(
            db=db,
            route_id=route_id,
            max_age=max_age,
            direction_id=direction_id,
        )
        if not vehicles:
            raise HTTPException(
                status_code=404,
                detail="No active vehicles found for this route",
            )
        return vehicles
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_route_vehicles endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
