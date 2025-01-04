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
    VehiclePositionResponse,
)

logger = logging.getLogger(__name__)


def get_nearby_stops_and_routes(
    db: Session,
    lat: float,
    lon: float,
    radius: float,
    current_time: str,  # Format: HH:MM:SS
    current_date: str,  # Format: YYYYMMDD
) -> list[NearbyResponse]:
    """
    Get nearby stops and their routes within a specified radius.
    Returns the next trip that arrives at their closest stop for both directions.
    Only returns trips that are operating on the specified date.

    For determining next trip:
    - If no vehicle position exists, uses static schedule (arrival_time >= current_time)
    - If vehicle position exists:
        - If vehicle has NOT passed our stop (not in TRANSIT_TO or STOPPED_AT for our stop
          or subsequent stops), use this trip even if arrival_time < current_time
        - If vehicle HAS passed our stop, use the next trip in the schedule
    """
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

    # Find services operating on the current date
    active_services = (
        db.query(CalendarDate.service_id)
        .filter(CalendarDate.date == current_date, CalendarDate.exception_type == 1)
        .subquery()
    )
    
    # TODO: Ensure to account for removed services and frequencies.txt for a generalized approach
    removed_services = (
        db.query(CalendarDate.service_id)
        .filter(CalendarDate.date == current_date, CalendarDate.exception_type == 2)
        .subquery()
    )

    # Get all stop sequences for each trip to determine stop order
    stop_sequences = db.query(
        StopTime.trip_id, StopTime.stop_id, StopTime.stop_sequence
    ).subquery()

    # Get current vehicle positions
    current_timestamp = datetime.now()
    time_threshold = current_timestamp - timedelta(minutes=5)
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

    # Get static schedule times with vehicle position information
    query = (
        db.query(
            StopTime,
            Trip,
            Route,
            nearby_stops_subquery.c.distance,
            nearby_stops_subquery.c.stop_name,
            nearby_stops_subquery.c.stop_lat,
            nearby_stops_subquery.c.stop_lon,
            vehicle_positions.c.current_status,
            vehicle_positions.c.current_stop_sequence,
            vehicle_positions.c.stop_id.label("vehicle_stop_id"),
            stop_sequences.c.stop_sequence.label("target_stop_sequence"),
        )
        .join(Trip, StopTime.trip_id == Trip.id)
        .join(Route, Trip.route_id == Route.id)
        .join(active_services, Trip.service_id == active_services.c.service_id)
        .join(
            nearby_stops_subquery, StopTime.stop_id == nearby_stops_subquery.c.stop_id
        )
        .outerjoin(vehicle_positions, StopTime.trip_id == vehicle_positions.c.trip_id)
        .join(
            stop_sequences,
            and_(
                StopTime.trip_id == stop_sequences.c.trip_id,
                StopTime.stop_id == stop_sequences.c.stop_id,
            ),
        )
        .order_by(
            nearby_stops_subquery.c.distance,
            Route.id,
            Trip.direction_id,
            StopTime.arrival_time,
        )
    )

    # Process results
    results: dict[tuple[str, int], NearbyResponse] = {}

    for (
        st,
        trip,
        route,
        distance,
        stop_name,
        stop_lat,
        stop_lon,
        current_status,
        current_stop_sequence,
        vehicle_stop_id,
        target_stop_sequence,
    ) in query:
        key = (route.id, trip.direction_id)

        # Skip if we already have a better trip for this route/direction
        if key in results:
            continue

        # Determine if this is the next trip based on vehicle position
        is_next_trip = False

        if current_status is None:
            # No vehicle position data, use static schedule
            is_next_trip = st.arrival_time >= current_time
        else:
            # Vehicle position exists
            if current_stop_sequence is None or target_stop_sequence is None:
                # Missing sequence information, fall back to static schedule
                is_next_trip = st.arrival_time >= current_time
            else:
                # Vehicle has not passed our stop
                vehicle_not_passed = (
                    current_stop_sequence
                    <= target_stop_sequence
                    # and current_status in ("IN_TRANSIT_TO", "STOPPED_AT")
                )

                is_next_trip = vehicle_not_passed  # or st.arrival_time >= current_time

        if is_next_trip:
            # Get realtime updates if available
            realtime_update = (
                db.query(RealtimeTripUpdate)
                .filter(
                    RealtimeTripUpdate.trip_id == trip.id,
                    RealtimeTripUpdate.stop_id == st.stop_id,
                    RealtimeTripUpdate.schedule_relationship != "CANCELED",
                    # RealtimeTripUpdate.timestamp >= func.datetime(current_date + " " + current_time),
                )
                .order_by(RealtimeTripUpdate.timestamp.desc())
                .first()
            )

            # Create VehiclePositionResponse if vehicle position exists
            vehicle_position_response = None
            if current_status is not None:
                vehicle_position_response = VehiclePositionResponse(
                    vehicle_id=vehicle_stop_id,
                    trip_id=trip.id,
                    route_id=route.id,
                    latitude=stop_lat,
                    longitude=stop_lon,
                    current_stop_id=vehicle_stop_id,
                    current_status=current_status,
                    timestamp=datetime.now(),  # You may want to adjust this
                    bearing=None,  # Add actual bearing if available
                    speed=None,  # Add actual speed if available
                    congestion_level=None,  # Add actual congestion level if available
                    occupancy_status=None,  # Add actual occupancy status if available
                    current_stop_sequence=current_stop_sequence,
                )

            results[key] = NearbyResponse(
                route=RouteInfo(
                    id=route.id,
                    short_name=route.route_short_name,
                    long_name=route.route_long_name,
                    type=route.route_type,
                ),
                trip=TripInfo(
                    id=trip.id,
                    service_id=trip.service_id,
                    trip_headsign=trip.trip_headsign,
                    trip_short_name=trip.trip_short_name,
                    direction_id=trip.direction_id,
                    shape_id=trip.shape_id,
                ),
                stop=StopInfo(
                    id=st.stop_id,
                    name=stop_name,
                    lat=stop_lat,
                    lon=stop_lon,
                    distance=distance,
                ),
                stop_time=StopTimeInfo(
                    trip_id=trip.id,
                    arrival_time=st.arrival_time,
                    departure_time=st.departure_time,
                    continuous_pickup=st.continuous_pickup or 0,
                    continuous_drop_off=st.continuous_drop_off or 0,
                    sequence=st.stop_sequence,
                    is_last=(
                        st.stop_sequence
                        == db.query(func.max(StopTime.stop_sequence))
                        .filter(StopTime.trip_id == trip.id)
                        .scalar()
                    ),
                    arrival_delay=(
                        realtime_update.arrival_delay if realtime_update else None
                    ),
                    departure_delay=(
                        realtime_update.departure_delay if realtime_update else None
                    ),
                ),
                vehicle_position=vehicle_position_response,
            )

    return list(results.values())
