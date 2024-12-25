from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, or_, text
from sqlalchemy.orm import Session
import logging

from app.core.database import get_db
from app.models.models import (
    Agency,
    RealtimeTripUpdate,
    Route,
    Stop,
    StopTime,
    Trip,
    Shape,
    VehiclePosition,
)

from app.api.schemas import (
    AgencyResponse,
    NearbyResponse,
    RouteInfo,
    RouteResponse,
    StopInfo,
    StopTimeInfo,
    TripInfo,
    TripShapeResponse,
    RouteStopTimeResponse,
    ShapePoint,
    RouteDetailsResponse,
    TripDetailsResponse,
    VehiclePositionResponse,
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
    Returns unique routes with their closest stops for each direction to the given location and next departure times.
    """
    try:
        if current_time is None:
            current_time = datetime.now().strftime("%H:%M:%S")

        # First, get nearby stops with distance calculation
        nearby_stops_subquery = (
            db.query(
                Stop.id.label("stop_id"),
                Stop.name.label("stop_name"),
                Stop.lat.label("stop_lat"),
                Stop.lon.label("stop_lon"),
                (
                    6371
                    * func.acos(
                        func.cos(func.radians(lat))
                        * func.cos(func.radians(Stop.lat))
                        * func.cos(func.radians(Stop.lon) - func.radians(lon))
                        + func.sin(func.radians(lat)) * func.sin(func.radians(Stop.lat))
                    )
                ).label("distance"),
            )
            .filter(
                Stop.lat.between(lat - (radius / 111.32), lat + (radius / 111.32)),
                Stop.lon.between(
                    lon - (radius / (111.32 * func.cos(func.radians(lat)))),
                    lon + (radius / (111.32 * func.cos(func.radians(lat)))),
                ),
            )
            .subquery()
        )

        # Get current timestamp for realtime updates
        current_timestamp = datetime.now()
        time_threshold = current_timestamp - timedelta(minutes=5)

        # Then, join with routes and get next departure times with realtime updates
        route_times_subquery = (
            db.query(
                nearby_stops_subquery.c.stop_id,
                nearby_stops_subquery.c.stop_name,
                nearby_stops_subquery.c.stop_lat,
                nearby_stops_subquery.c.stop_lon,
                nearby_stops_subquery.c.distance,
                Route.id.label("route_id"),
                Route.route_short_name,
                Route.route_long_name,
                Route.route_type,
                Trip.id.label("trip_id"),
                Trip.service_id,
                Trip.trip_headsign,
                Trip.trip_short_name,
                Trip.direction_id,
                Trip.shape_id,
                StopTime.trip_id,
                StopTime.arrival_time,
                StopTime.departure_time,
                StopTime.continuous_pickup,
                StopTime.continuous_drop_off,
                RealtimeTripUpdate.arrival_delay.label("arrival_delay"),
                RealtimeTripUpdate.departure_delay.label("departure_delay"),
                func.row_number()
                .over(
                    partition_by=[
                        Route.id,
                        Trip.direction_id,
                    ],  # Partition by both route and direction
                    order_by=[
                        nearby_stops_subquery.c.distance,
                        case((StopTime.departure_time >= current_time, 0), else_=1),
                        StopTime.departure_time,
                    ],
                )
                .label("rank"),
            )
            .join(StopTime, nearby_stops_subquery.c.stop_id == StopTime.stop_id)
            .join(Trip, StopTime.trip_id == Trip.id)
            .join(Route, Trip.route_id == Route.id)
            .outerjoin(
                RealtimeTripUpdate,
                and_(
                    RealtimeTripUpdate.trip_id == StopTime.trip_id,
                    RealtimeTripUpdate.stop_id == nearby_stops_subquery.c.stop_id,
                    RealtimeTripUpdate.timestamp >= time_threshold,
                ),
            )
            .filter(StopTime.departure_time.isnot(None))
            .filter(nearby_stops_subquery.c.distance <= radius)
            .subquery()
        )

        # Final query to get only the closest stop per route direction
        results = (
            db.query(route_times_subquery)
            .filter(route_times_subquery.c.rank == 1)
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

            trip_info = TripInfo(
                id=result.trip_id,
                service_id=result.service_id,
                trip_headsign=result.trip_headsign or "",
                trip_short_name=result.trip_short_name or "",
                direction_id=result.direction_id,
                shape_id=result.shape_id,
            )

            stop_info = StopInfo(
                id=result.stop_id,
                name=result.stop_name,
                lat=result.stop_lat,
                lon=result.stop_lon,
            )

            is_last = result.departure_time < current_time

            stop_time_info = StopTimeInfo(
                trip_id=result.trip_id,
                arrival_time=result.arrival_time,
                departure_time=result.departure_time,
                continuous_pickup=result.continuous_pickup or 0,
                continuous_drop_off=result.continuous_drop_off or 0,
                is_last=is_last,
                arrival_delay=result.arrival_delay,
                departure_delay=result.departure_delay,
            )

            response.append(
                NearbyResponse(
                    route=route_info,
                    trip=trip_info,
                    stop=stop_info,
                    stop_time=stop_time_info,
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


@router.get("/trips/{trip_id}/shapes", response_model=TripShapeResponse, tags=["trips"])
def get_trip_shape(trip_id: str, db: Session = Depends(get_db)):
    """
    Get the shape points for a specific trip, ordered by sequence number.
    """
    try:
        # Get the shape_id for the trip
        trip = db.query(Trip).filter(Trip.id == trip_id).first()
        if not trip or not trip.shape_id:
            raise HTTPException(status_code=404, detail="Trip or shape not found")

        # Get shape points ordered by sequence
        shape_points = (
            db.query(Shape)
            .filter(Shape.shape_id == trip.shape_id)
            .order_by(Shape.shape_pt_sequence)
            .all()
        )

        if not shape_points:
            raise HTTPException(status_code=404, detail="No shape points found")

        # Transform to response model
        return TripShapeResponse(
            trip_id=trip_id,
            shape_points=[
                ShapePoint(
                    lat=point.shape_pt_lat,
                    lon=point.shape_pt_lon,
                    sequence=point.shape_pt_sequence,
                    dist_traveled=point.shape_dist_traveled,
                )
                for point in shape_points
            ],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching shape for trip {trip_id}: {str(e)}")
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
):
    """
    Get all stop times for a specific route at a specific stop, including realtime updates if available.
    Returns times sorted by departure time, with realtime delay information when available.
    """
    try:
        if current_time is None:
            current_time = datetime.now().strftime("%H:%M:%S")

        # Get current timestamp for realtime updates
        current_timestamp = datetime.now()
        time_threshold = current_timestamp - timedelta(minutes=5)

        # Query stop times with realtime updates
        results = (
            db.query(
                StopTime.trip_id,
                StopTime.arrival_time,
                StopTime.departure_time,
                Trip.trip_headsign,
                RealtimeTripUpdate.arrival_delay,
                RealtimeTripUpdate.departure_delay,
                RealtimeTripUpdate.timestamp,
            )
            .join(Trip, StopTime.trip_id == Trip.id)
            .filter(
                Trip.route_id == route_id,
                StopTime.stop_id == stop_id,
                StopTime.departure_time >= current_time,
            )
            .outerjoin(
                RealtimeTripUpdate,
                and_(
                    RealtimeTripUpdate.trip_id == StopTime.trip_id,
                    RealtimeTripUpdate.stop_id == stop_id,
                    RealtimeTripUpdate.timestamp >= time_threshold,
                ),
            )
            .order_by(StopTime.departure_time)
            .all()
        )

        if not results:
            raise HTTPException(
                status_code=404,
                detail="No stop times found for this route and stop combination",
            )

        # Transform to response model
        return [
            RouteStopTimeResponse(
                trip_id=result.trip_id,
                arrival_time=result.arrival_time,
                departure_time=result.departure_time,
                trip_headsign=result.trip_headsign or "",
                realtime_arrival_delay=result.arrival_delay,
                realtime_departure_delay=result.departure_delay,
                realtime_timestamp=result.timestamp,
            )
            for result in results
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error fetching stop times for route {route_id} at stop {stop_id}: {str(e)}"
        )
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/routes/{route_id}", response_model=RouteDetailsResponse, tags=["routes"])
def get_route_details(route_id: str, db: Session = Depends(get_db)):
    """
    Get detailed information about a specific route.
    """
    try:
        route = db.query(Route).filter(Route.id == route_id).first()

        if not route:
            raise HTTPException(status_code=404, detail="Route not found")

        return RouteDetailsResponse(
            id=route.id,
            agency_id=route.agency_id,
            short_name=route.route_short_name or "",
            long_name=route.route_long_name or "",
            description=route.route_desc,
            route_type=route.route_type,
            url=route.route_url,
            color=route.route_color,
            text_color=route.route_text_color,
            sort_order=route.route_sort_order,
            continuous_pickup=route.continuous_pickup,
            continuous_drop_off=route.continuous_drop_off,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching route details for route {route_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/trips/{trip_id}", response_model=TripDetailsResponse, tags=["trips"])
def get_trip_details(trip_id: str, db: Session = Depends(get_db)):
    """
    Get detailed information about a specific trip, including any current realtime status.
    """
    try:
        # Get current timestamp for realtime updates
        current_timestamp = datetime.now()
        time_threshold = current_timestamp - timedelta(minutes=5)

        # Query trip with latest realtime update
        result = (
            db.query(
                Trip,
                RealtimeTripUpdate.current_status,
                RealtimeTripUpdate.departure_delay,
                RealtimeTripUpdate.timestamp,
            )
            .outerjoin(
                RealtimeTripUpdate,
                and_(
                    RealtimeTripUpdate.trip_id == Trip.id,
                    RealtimeTripUpdate.timestamp >= time_threshold,
                ),
            )
            .filter(Trip.id == trip_id)
            .first()
        )

        if not result or not result[0]:
            raise HTTPException(status_code=404, detail="Trip not found")

        trip = result[0]
        return TripDetailsResponse(
            id=trip.id,
            route_id=trip.route_id,
            service_id=trip.service_id,
            headsign=trip.trip_headsign or "",
            short_name=trip.trip_short_name or "",
            direction_id=trip.direction_id,
            block_id=trip.block_id,
            shape_id=trip.shape_id,
            wheelchair_accessible=trip.wheelchair_accessible,
            bikes_allowed=trip.bikes_allowed,
            current_status=result[1],
            current_delay=result[2],
            last_updated=result[3],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching trip details for trip {trip_id}: {str(e)}")
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
    Returns vehicle positions updated within the specified max_age (defaults to 300 seconds).
    Optionally filter by direction_id (0 or 1) if provided.
    """
    try:
        # Get current timestamp for filtering stale positions
        current_timestamp = datetime.now()
        time_threshold = current_timestamp - timedelta(seconds=max_age)

        # Base query with trip join for direction filtering
        query = (
            db.query(VehiclePosition)
            .join(Trip, VehiclePosition.trip_id == Trip.id, isouter=True)
            .filter(
                VehiclePosition.route_id == route_id,
                VehiclePosition.timestamp >= time_threshold,
            )
        )

        # Add direction filter if specified
        if direction_id is not None:
            query = query.filter(Trip.direction_id == direction_id)

        # Get results ordered by timestamp
        vehicles = query.order_by(VehiclePosition.timestamp.desc()).all()

        if not vehicles:
            raise HTTPException(
                status_code=404,
                detail="No active vehicles found for this route",
            )

        return [
            VehiclePositionResponse(
                vehicle_id=vehicle.vehicle_id,
                trip_id=vehicle.trip_id,
                route_id=vehicle.route_id,
                latitude=vehicle.latitude,
                longitude=vehicle.longitude,
                current_stop_id=vehicle.stop_id,
                current_status=vehicle.current_status,
                timestamp=vehicle.timestamp,
                bearing=vehicle.bearing,
                speed=vehicle.speed,
                congestion_level=vehicle.congestion_level,
                occupancy_status=vehicle.occupancy_status,
                current_stop_sequence=vehicle.current_stop_sequence,
            )
            for vehicle in vehicles
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching vehicle positions for route {route_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
