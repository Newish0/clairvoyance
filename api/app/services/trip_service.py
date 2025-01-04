from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from sqlalchemy import and_
from sqlalchemy.orm import Session, joinedload
import logging

from app.models.models import Trip, Shape, StopTime, RealtimeTripUpdate
from app.api.schemas import (
    TripShapeResponse,
    TripDetailsResponse,
    TripStopResponse,
    ShapePoint,
)

logger = logging.getLogger(__name__)

def get_trip_shape(db: Session, trip_id: str) -> Optional[TripShapeResponse]:
    """Get the shape points for a specific trip, ordered by sequence number."""
    try:
        # Get the shape_id for the trip
        trip = db.query(Trip).filter(Trip.id == trip_id).first()
        if not trip or not trip.shape_id:
            return None

        # Get shape points ordered by sequence
        shape_points = (
            db.query(Shape)
            .filter(Shape.shape_id == trip.shape_id)
            .order_by(Shape.shape_pt_sequence)
            .all()
        )

        if not shape_points:
            return None

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

    except Exception as e:
        logger.error(f"Error fetching shape for trip {trip_id}: {str(e)}")
        raise

def get_trip_stops(db: Session, trip_id: str) -> List[TripStopResponse]:
    """Get the stops & stop times for a specific trip, ordered by stop sequence number."""
    try:
        stop_times_with_stop = (
            db.query(StopTime)
            .options(joinedload(StopTime.stop))
            .filter(StopTime.trip_id == trip_id)
            .order_by(StopTime.stop_sequence)
            .all()
        )

        if not stop_times_with_stop:
            return []

        return [map_trip_stop_to_response(stop_time) for stop_time in stop_times_with_stop]

    except Exception as e:
        logger.error(f"Error fetching stop and stop times for trip {trip_id}: {str(e)}")
        raise

def get_trip_details(db: Session, trip_id: str) -> Optional[TripDetailsResponse]:
    """Get detailed information about a specific trip, including any current realtime status."""
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
            return None

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

    except Exception as e:
        logger.error(f"Error fetching trip details for trip {trip_id}: {str(e)}")
        raise

def map_trip_stop_to_response(stop_time_with_stop) -> TripStopResponse:
    """Maps a StopTime ORM object with joined Stop data to the response schema."""
    return TripStopResponse(
        # StopTime fields
        stop_time_id=stop_time_with_stop.id,
        trip_id=stop_time_with_stop.trip_id,
        arrival_time=stop_time_with_stop.arrival_time,
        departure_time=stop_time_with_stop.departure_time,
        stop_sequence=stop_time_with_stop.stop_sequence,
        stop_headsign=stop_time_with_stop.stop_headsign,
        pickup_type=stop_time_with_stop.pickup_type,
        drop_off_type=stop_time_with_stop.drop_off_type,
        shape_dist_traveled=stop_time_with_stop.shape_dist_traveled,
        timepoint=stop_time_with_stop.timepoint,
        continuous_pickup=stop_time_with_stop.continuous_pickup,
        continuous_drop_off=stop_time_with_stop.continuous_drop_off,
        # Stop fields
        stop_id=stop_time_with_stop.stop.id,
        stop_name=stop_time_with_stop.stop.name,
        stop_lat=stop_time_with_stop.stop.lat,
        stop_lon=stop_time_with_stop.stop.lon,
        stop_code=stop_time_with_stop.stop.code,
        stop_desc=stop_time_with_stop.stop.desc,
        zone_id=stop_time_with_stop.stop.zone_id,
        stop_url=stop_time_with_stop.stop.url,
        location_type=stop_time_with_stop.stop.location_type,
        parent_station=stop_time_with_stop.stop.parent_station,
        stop_timezone=stop_time_with_stop.stop.timezone,
        wheelchair_boarding=stop_time_with_stop.stop.wheelchair_boarding,
        level_id=stop_time_with_stop.stop.level_id,
        platform_code=stop_time_with_stop.stop.platform_code,
    ) 