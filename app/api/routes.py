from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, or_, text
from sqlalchemy.orm import Session
import logging

from app.core.database import get_db
from app.models.models import Agency, Route, Stop, StopTime, Trip

from app.api.schemas import (
    AgencyResponse,
    NearbyResponse,
    RouteInfo,
    RouteResponse,
    StopInfo,
    StopTimeInfo,
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
):
    """
    Get nearby stops and their routes within a specified radius.
    Returns unique routes with their closest stops to the given location and next departure times.

    Parameters:
    - lat: Latitude of the search point
    - lon: Longitude of the search point
    - radius: Search radius in kilometers (default: 0.5km, min: 0.1km, max: 5km)
    - current_time: Time to check against in HH:MM:SS format (default: current time)
    """
    try:
        # Get current time if not provided
        if current_time is None:
            current_time = datetime.now().strftime("%H:%M:%S")

        # Subquery to calculate distances and rank stops by distance and time
        distance_subquery = (
            db.query(
                Stop.id.label("stop_id"),
                Route.id.label("route_id"),
                Route.route_short_name,
                Route.route_long_name,
                Route.route_type,
                Stop.name.label("stop_name"),
                Stop.lat.label("stop_lat"),
                Stop.lon.label("stop_lon"),
                StopTime.trip_id,
                StopTime.arrival_time,
                StopTime.departure_time,
                StopTime.continuous_pickup,
                StopTime.continuous_drop_off,
                (
                    6371
                    * func.acos(
                        func.cos(func.radians(lat))
                        * func.cos(func.radians(Stop.lat))
                        * func.cos(func.radians(Stop.lon) - func.radians(lon))
                        + func.sin(func.radians(lat)) * func.sin(func.radians(Stop.lat))
                    )
                ).label("distance"),
                # Rank by distance first, then by next departure time
                func.row_number()
                .over(
                    partition_by=Route.id,
                    order_by=[
                        (
                            6371
                            * func.acos(
                                func.cos(func.radians(lat))
                                * func.cos(func.radians(Stop.lat))
                                * func.cos(func.radians(Stop.lon) - func.radians(lon))
                                + func.sin(func.radians(lat))
                                * func.sin(func.radians(Stop.lat))
                            )
                        ),
                        # Handle time wrapping around midnight
                        case((StopTime.departure_time >= current_time, 0), else_=1),
                        StopTime.departure_time,
                    ],
                )
                .label("rank"),
            )
            .join(StopTime, Stop.id == StopTime.stop_id)
            .join(Trip, StopTime.trip_id == Trip.id)
            .join(Route, Trip.route_id == Route.id)
            # Filter for stops with departure times
            .filter(StopTime.departure_time.isnot(None))
            # Get both future times and past times (for next day)
            .filter(
                or_(
                    StopTime.departure_time >= current_time,
                    StopTime.departure_time < current_time,
                )
            )
            .subquery()
        )

        # Main query to get the closest stop for each route within radius
        results = (
            db.query(distance_subquery)
            .filter(distance_subquery.c.distance <= radius)
            .filter(distance_subquery.c.rank == 1)
            .all()
        )

        # Transform results into response model
        response = []
        for result in results:
            route_info = RouteInfo(
                id=result.route_id,
                short_name=result.route_short_name or "",
                long_name=result.route_long_name or "",
                type=result.route_type,
            )

            stop_info = StopInfo(
                id=result.stop_id,
                name=result.stop_name,
                lat=result.stop_lat,
                lon=result.stop_lon,
            )

            # Determine if this is the last stop of the day
            is_last = result.departure_time < current_time

            stop_time_info = StopTimeInfo(
                trip_id=result.trip_id,
                arrival_time=result.arrival_time,
                departure_time=result.departure_time,
                continuous_pickup=result.continuous_pickup or 0,
                continuous_drop_off=result.continuous_drop_off or 0,
                is_last=is_last,
            )

            response.append(
                NearbyResponse(
                    route=route_info, stop=stop_info, stop_time=stop_time_info
                )
            )

        return response

    except Exception as e:
        logger.error(f"Error fetching nearby stops: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/agencies", response_model=List[AgencyResponse], tags=["agencies"])
def get_agencies(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    """
    Get all transit agencies with pagination support.
    """
    try:
        agencies = db.query(Agency).offset(skip).limit(limit).all()
        return agencies
    except Exception as e:
        logger.error(f"Error fetching agencies: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/agencies/{agency_id}", response_model=AgencyResponse, tags=["agencies"])
def get_agency(agency_id: str, db: Session = Depends(get_db)):
    """
    Get details for a specific transit agency.
    """
    try:
        agency = db.query(Agency).filter(Agency.id == agency_id).first()
        if agency is None:
            raise HTTPException(status_code=404, detail="Agency not found")
        return agency
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agency {agency_id}: {str(e)}")
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
    """
    Get routes for a specific transit agency with pagination support.
    """
    try:
        routes = (
            db.query(Route)
            .filter(Route.agency_id == agency_id)
            .offset(skip)
            .limit(limit)
            .all()
        )
        if not routes:
            raise HTTPException(
                status_code=404, detail="No routes found for this agency"
            )
        return routes
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching routes for agency {agency_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


# @router.get(
#     "/realtime/{agency_id}",
#     response_model=List[RealtimeUpdateResponse],
#     tags=["realtime"],
# )
# def get_realtime_updates(
#     agency_id: str,
#     db: Session = Depends(get_db),
#     skip: int = Query(0, ge=0),
#     limit: int = Query(100, ge=1, le=1000),
# ):
#     """
#     Get realtime updates for a specific transit agency with pagination support.
#     """
#     try:
#         # First check if agency exists
#         agency = db.query(Agency).filter(Agency.id == agency_id).first()
#         if not agency:
#             raise HTTPException(status_code=404, detail="Agency not found")

#         updates = (
#             db.query(RealtimeUpdate)
#             .join(Trip)
#             .join(Route)
#             .filter(Route.agency_id == agency_id)
#             .order_by(RealtimeUpdate.timestamp.desc())
#             .offset(skip)
#             .limit(limit)
#             .all()
#         )

#         if not updates:
#             raise HTTPException(
#                 status_code=404, detail="No realtime updates found for this agency"
#             )

#         return updates
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(
#             f"Error fetching realtime updates for agency {agency_id}: {str(e)}"
#         )
#         raise HTTPException(status_code=500, detail="Internal server error")


# @router.post("/agencies/{agency_id}/load-static", tags=["data-loading"])
# def load_static_data(agency_id: str, db: Session = Depends(get_db)):
#     """
#     Trigger loading of static GTFS data for a specific agency.
#     """
#     try:
#         download_and_load_static_gtfs(db, agency_id)
#         return {"message": f"Static GTFS data loaded successfully for agency {agency_id}"}
#     except Exception as e:
#         logger.error(f"Error loading static data for agency {agency_id}: {str(e)}")
#         raise HTTPException(status_code=500, detail=str(e))

# @router.post("/agencies/{agency_id}/load-realtime", tags=["data-loading"])
# def load_realtime_data(agency_id: str, db: Session = Depends(get_db)):
#     """
#     Trigger loading of realtime GTFS data for a specific agency.
#     """
#     try:
#         fetch_realtime_updates(db, agency_id)
#         return {"message": f"Realtime GTFS data loaded successfully for agency {agency_id}"}
#     except Exception as e:
#         logger.error(f"Error loading realtime data for agency {agency_id}: {str(e)}")
#         raise HTTPException(status_code=500, detail=str(e))
