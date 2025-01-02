from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy import and_, func
from sqlalchemy.orm import Session
import logging

from app.models.models import VehiclePosition, Trip
from app.api.schemas import VehiclePositionResponse

logger = logging.getLogger(__name__)

def get_route_vehicles(
    db: Session,
    route_id: str,
    max_age: int = 300,
    direction_id: Optional[int] = None,
) -> List[VehiclePositionResponse]:
    """
    Get current positions of all vehicles operating on a specific route.
    Returns the latest position for each unique vehicle within the specified max_age.
    Optionally filter by direction_id (0 or 1) if provided.
    """
    try:
        # Get current timestamp for filtering stale positions
        current_timestamp = datetime.now()
        time_threshold = current_timestamp - timedelta(seconds=max_age)

        # Subquery to get the latest timestamp for each vehicle
        latest_positions = (
            db.query(
                VehiclePosition.vehicle_id,
                func.max(VehiclePosition.timestamp).label('latest_timestamp')
            )
            .filter(
                VehiclePosition.route_id == route_id,
                VehiclePosition.timestamp >= time_threshold
            )
            .group_by(VehiclePosition.vehicle_id)
            .subquery()
        )

        # Main query joining with the latest timestamps
        query = (
            db.query(VehiclePosition)
            .join(
                latest_positions,
                and_(
                    VehiclePosition.vehicle_id == latest_positions.c.vehicle_id,
                    VehiclePosition.timestamp == latest_positions.c.latest_timestamp
                )
            )
            .join(Trip, VehiclePosition.trip_id == Trip.id, isouter=True)
        )

        # Add direction filter if specified
        if direction_id is not None:
            query = query.filter(Trip.direction_id == direction_id)

        # Get results
        vehicles = query.all()

        if not vehicles:
            return []

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

    except Exception as e:
        logger.error(f"Error fetching vehicle positions for route {route_id}: {str(e)}")
        raise 