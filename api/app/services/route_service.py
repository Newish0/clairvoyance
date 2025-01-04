from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy import and_, func, not_
from sqlalchemy.orm import Session
import logging

from app.models.models import Route, Trip, StopTime, RealtimeTripUpdate, CalendarDate, VehiclePosition
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
    db: Session, route_id: str, stop_id: str, current_time: str, current_date: str
) -> List[RouteStopTimeResponse]:
    """
    Get all stop times for a specific route at a specific stop.
    Returns times sorted by departure time, with latest realtime delay information when available.
    Only returns trips that are operating on the specified date.

    For determining next trips:
    - If no vehicle position exists, uses static schedule (arrival_time >= current_time)
    - If vehicle position exists:
        - If vehicle has NOT passed our stop (not in TRANSIT_TO or STOPPED_AT for our stop
          or subsequent stops), include this trip even if arrival_time < current_time
        - If vehicle HAS passed our stop, use the next trip in the schedule
    """
    try:
        current_timestamp = datetime.now()
        time_threshold = current_timestamp - timedelta(minutes=5)

        # Get active services
        active_services_subquery = (
            db.query(CalendarDate.service_id)
            .filter(CalendarDate.date == current_date, CalendarDate.exception_type == 1)
            .subquery()
        )

        removed_services_subquery = (
            db.query(CalendarDate.service_id)
            .filter(CalendarDate.date == current_date, CalendarDate.exception_type == 2)
            .subquery()
        )

        # Get all stop sequences for each trip to determine stop order
        stop_sequences = (
            db.query(StopTime.trip_id, StopTime.stop_id, StopTime.stop_sequence)
            .filter(StopTime.trip_id == Trip.id)
            .subquery()
        )

        # Get current vehicle positions
        vehicle_positions = (
            db.query(
                VehiclePosition.trip_id,
                VehiclePosition.current_status,
                VehiclePosition.current_stop_sequence,
                VehiclePosition.stop_id,
            )
            .filter(VehiclePosition.timestamp >= time_threshold)
            .distinct(VehiclePosition.trip_id)
            .order_by(VehiclePosition.trip_id, VehiclePosition.timestamp.desc())
            .subquery()
        )

        # Get latest realtime updates
        latest_updates_subquery = (
            db.query(
                RealtimeTripUpdate.trip_id,
                RealtimeTripUpdate.stop_id,
                RealtimeTripUpdate.arrival_delay,
                RealtimeTripUpdate.departure_delay,
                RealtimeTripUpdate.timestamp,
                RealtimeTripUpdate.schedule_relationship,
            )
            .filter(
                RealtimeTripUpdate.stop_id == stop_id,
                RealtimeTripUpdate.timestamp >= time_threshold,
                RealtimeTripUpdate.schedule_relationship != "CANCELED",
            )
            .distinct(
                RealtimeTripUpdate.trip_id,
                RealtimeTripUpdate.stop_id,
            )
            .order_by(
                RealtimeTripUpdate.trip_id,
                RealtimeTripUpdate.stop_id,
                RealtimeTripUpdate.timestamp.desc(),
            )
            .subquery()
        )

        # Main query
        results = (
            db.query(
                StopTime.trip_id,
                StopTime.arrival_time,
                StopTime.departure_time,
                StopTime.stop_sequence,
                Trip.trip_headsign,
                latest_updates_subquery.c.arrival_delay,
                latest_updates_subquery.c.departure_delay,
                latest_updates_subquery.c.timestamp,
                vehicle_positions.c.current_status,
                vehicle_positions.c.current_stop_sequence,
                stop_sequences.c.stop_sequence.label("target_stop_sequence"),
            )
            .join(Trip, StopTime.trip_id == Trip.id)
            .filter(
                Trip.route_id == route_id,
                StopTime.stop_id == stop_id,
                Trip.service_id.in_(active_services_subquery),
                not_(Trip.service_id.in_(removed_services_subquery)),
            )
            .outerjoin(
                latest_updates_subquery,
                and_(
                    latest_updates_subquery.c.trip_id == StopTime.trip_id,
                    latest_updates_subquery.c.stop_id == stop_id,
                ),
            )
            .outerjoin(
                vehicle_positions,
                StopTime.trip_id == vehicle_positions.c.trip_id,
            )
            .join(
                stop_sequences,
                and_(
                    StopTime.trip_id == stop_sequences.c.trip_id,
                    StopTime.stop_id == stop_sequences.c.stop_id,
                ),
            )
            .order_by(StopTime.departure_time)
            .all()
        )

        if not results:
            return []

        # Filter results based on vehicle position logic
        filtered_results = []
        for result in results:
            is_next_trip = False

            if result.current_status is None:
                # No vehicle position data, use static schedule
                is_next_trip = result.departure_time >= current_time
            else:
                # Vehicle position exists
                if (
                    result.current_stop_sequence is None
                    or result.target_stop_sequence is None
                ):
                    # Missing sequence information, fall back to static schedule
                    is_next_trip = result.departure_time >= current_time
                else:
                    # Vehicle has not passed our stop
                    vehicle_not_passed = (
                        result.current_stop_sequence <= result.target_stop_sequence
                    )
                    is_next_trip = vehicle_not_passed

            if is_next_trip:
                filtered_results.append(
                    RouteStopTimeResponse(
                        trip_id=result.trip_id,
                        arrival_time=result.arrival_time,
                        departure_time=result.departure_time,
                        trip_headsign=result.trip_headsign or "",
                        realtime_arrival_delay=result.arrival_delay,
                        realtime_departure_delay=result.departure_delay,
                        realtime_timestamp=result.timestamp,
                    )
                )

        return filtered_results

    except Exception as e:
        logger.error(
            f"Error fetching stop times for route {route_id} at stop {stop_id}: {str(e)}"
        )
        raise
