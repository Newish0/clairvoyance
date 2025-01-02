from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy import and_
from sqlalchemy.orm import Session
import logging

from app.models.models import Route, Trip, StopTime, RealtimeTripUpdate
from app.api.schemas import RouteResponse, RouteDetailsResponse, RouteStopTimeResponse

logger = logging.getLogger(__name__)

def get_agency_routes(
    db: Session, agency_id: str, skip: int = 0, limit: int = 100
) -> List[RouteResponse]:
    """Get routes for a specific transit agency with pagination support."""
    try:
        routes = (
            db.query(Route)
            .filter(Route.agency_id == agency_id)
            .offset(skip)
            .limit(limit)
            .all()
        )
        return routes
    except Exception as e:
        logger.error(f"Error fetching routes for agency {agency_id}: {str(e)}")
        raise

def get_route_details(db: Session, route_id: str) -> RouteDetailsResponse:
    """Get detailed information about a specific route."""
    try:
        route = db.query(Route).filter(Route.id == route_id).first()
        if not route:
            return None
            
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
    except Exception as e:
        logger.error(f"Error fetching route details for route {route_id}: {str(e)}")
        raise

def get_route_stop_times(
    db: Session, route_id: str, stop_id: str, current_time: str
) -> List[RouteStopTimeResponse]:
    """
    Get all stop times for a specific route at a specific stop.
    Returns times sorted by departure time, with realtime delay information when available.
    """
    try:
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
            return []

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

    except Exception as e:
        logger.error(
            f"Error fetching stop times for route {route_id} at stop {stop_id}: {str(e)}"
        )
        raise 