from datetime import datetime, timedelta
from sqlalchemy import and_, case, func, or_, not_
from sqlalchemy.orm import Session
import logging

from app.models.models import (
    Route,
    Stop,
    StopTime,
    Trip,
    RealtimeTripUpdate,
    CalendarDate,
    VehiclePosition,
)

from app.api.schemas import (
    NearbyResponse,
    RouteInfo,
    StopInfo,
    TripInfo,
    StopTimeInfo,
)

logger = logging.getLogger(__name__)


def get_nearby_stops_and_routes(
    db: Session,
    lat: float,
    lon: float,
    radius: float,
    current_time: str,
    current_date: str,  # Format: YYYYMMDD
) -> list[NearbyResponse]:
    """
    Get nearby stops and their routes within a specified radius.
    Returns unique routes with their closest stops for each direction.
    Only returns trips that are operating on the specified date.
    """
    try:
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

        # Get service IDs that are active on the current date
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

        # Get the latest vehicle positions for each trip
        latest_vehicle_positions = (
            db.query(
                VehiclePosition.trip_id,
                VehiclePosition.stop_id,
                VehiclePosition.current_status,
                VehiclePosition.current_stop_sequence,
                func.row_number()
                .over(
                    partition_by=VehiclePosition.trip_id,
                    order_by=VehiclePosition.timestamp.desc(),
                )
                .label("pos_rank"),
            )
            .filter(VehiclePosition.timestamp >= time_threshold)
            .subquery()
        )

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
                StopTime.stop_sequence,
                StopTime.continuous_pickup,
                StopTime.continuous_drop_off,
                RealtimeTripUpdate.arrival_delay.label("arrival_delay"),
                RealtimeTripUpdate.departure_delay.label("departure_delay"),
                latest_vehicle_positions.c.current_status,
                latest_vehicle_positions.c.current_stop_sequence,
                func.row_number()
                .over(
                    partition_by=[Route.id, Trip.direction_id],
                    order_by=[
                        nearby_stops_subquery.c.distance,
                        # Use realtime data is available to determine next trip
                        case(
                            (
                                # Only consider the transit has passed stop if it's next stop is subsequent stops
                                latest_vehicle_positions.c.current_stop_sequence
                                > StopTime.stop_sequence,
                                1,  # Passed
                            ),
                            else_=case(
                                (
                                    StopTime.departure_time >= current_time,
                                    0,  # Not Passed
                                ),
                                else_=1,  # Passed
                            ),
                        ),
                        StopTime.departure_time,
                    ],
                )
                .label("rank"),
            )
            .join(StopTime, nearby_stops_subquery.c.stop_id == StopTime.stop_id)
            .join(Trip, StopTime.trip_id == Trip.id)
            .join(Route, Trip.route_id == Route.id)
            .outerjoin(
                latest_vehicle_positions,
                and_(
                    latest_vehicle_positions.c.trip_id == Trip.id,
                    latest_vehicle_positions.c.pos_rank == 1,
                ),
            )
            .outerjoin(
                RealtimeTripUpdate,
                and_(
                    RealtimeTripUpdate.trip_id == StopTime.trip_id,
                    RealtimeTripUpdate.stop_id == nearby_stops_subquery.c.stop_id,
                    RealtimeTripUpdate.timestamp >= time_threshold,
                ),
            )
            .filter(
                StopTime.departure_time.isnot(None),
                nearby_stops_subquery.c.distance <= radius,
                Trip.service_id.in_(active_services_subquery),
                not_(Trip.service_id.in_(removed_services_subquery)),
            )
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
                distance=result.distance,
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
        raise
