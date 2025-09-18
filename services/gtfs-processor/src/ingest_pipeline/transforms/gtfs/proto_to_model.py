from dataclasses import dataclass
from typing import Optional
from lib import gtfs_realtime_pb2 as pb
import models.mongo_schemas as ms
from utils.datetime import convert_to_datetime


_TRIP_DESCRIPTOR_SCHEDULE_RELATIONSHIP_MAP = {
    pb.TripDescriptor.ScheduleRelationship.SCHEDULED: ms.TripDescriptorScheduleRelationship.SCHEDULED,
    pb.TripDescriptor.ScheduleRelationship.ADDED: ms.TripDescriptorScheduleRelationship.ADDED,
    pb.TripDescriptor.ScheduleRelationship.UNSCHEDULED: ms.TripDescriptorScheduleRelationship.UNSCHEDULED,
    pb.TripDescriptor.ScheduleRelationship.CANCELED: ms.TripDescriptorScheduleRelationship.CANCELED,
    pb.TripDescriptor.ScheduleRelationship.REPLACEMENT: ms.TripDescriptorScheduleRelationship.REPLACEMENT,
    pb.TripDescriptor.ScheduleRelationship.DUPLICATED: ms.TripDescriptorScheduleRelationship.DUPLICATED,
    pb.TripDescriptor.ScheduleRelationship.DELETED: ms.TripDescriptorScheduleRelationship.DELETED,
    pb.TripDescriptor.ScheduleRelationship.NEW: ms.TripDescriptorScheduleRelationship.NEW,
}

_DIRECTION_ID_MAP = {0: ms.Direction.OUTBOUND, 1: ms.Direction.INBOUND}

_STOP_TIME_SCHEDULE_RELATIONSHIP_MAP = {
    pb.TripUpdate.StopTimeUpdate.ScheduleRelationship.SCHEDULED: ms.StopTimeUpdateScheduleRelationship.SCHEDULED,
    pb.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED: ms.StopTimeUpdateScheduleRelationship.SKIPPED,
    pb.TripUpdate.StopTimeUpdate.ScheduleRelationship.NO_DATA: ms.StopTimeUpdateScheduleRelationship.NO_DATA,
    pb.TripUpdate.StopTimeUpdate.ScheduleRelationship.UNSCHEDULED: ms.StopTimeUpdateScheduleRelationship.UNSCHEDULED,
}

_OCCUPANCY_STATUS_MAP = {
    pb.VehiclePosition.OccupancyStatus.EMPTY: ms.OccupancyStatus.EMPTY,
    pb.VehiclePosition.OccupancyStatus.MANY_SEATS_AVAILABLE: ms.OccupancyStatus.MANY_SEATS_AVAILABLE,
    pb.VehiclePosition.OccupancyStatus.FEW_SEATS_AVAILABLE: ms.OccupancyStatus.FEW_SEATS_AVAILABLE,
    pb.VehiclePosition.OccupancyStatus.STANDING_ROOM_ONLY: ms.OccupancyStatus.STANDING_ROOM_ONLY,
    pb.VehiclePosition.OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY: ms.OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY,
    pb.VehiclePosition.OccupancyStatus.FULL: ms.OccupancyStatus.FULL,
    pb.VehiclePosition.OccupancyStatus.NOT_ACCEPTING_PASSENGERS: ms.OccupancyStatus.NOT_ACCEPTING_PASSENGERS,
    pb.VehiclePosition.OccupancyStatus.NO_DATA_AVAILABLE: ms.OccupancyStatus.NO_DATA_AVAILABLE,
    pb.VehiclePosition.OccupancyStatus.NOT_BOARDABLE: ms.OccupancyStatus.NOT_BOARDABLE,
}


@dataclass(frozen=True)
class IntermediateStopTimeUpdate:
    stop_id: str
    stop_sequence: Optional[int]
    scheduled_arrival_time: Optional[int]
    arrival_time: Optional[int]
    arrival_delay: Optional[int]
    arrival_uncertainty: Optional[int]
    scheduled_departure_time: Optional[int]
    departure_time: Optional[int]
    departure_delay: Optional[int]
    departure_uncertainty: Optional[int]

    schedule_relationship: ms.StopTimeUpdateScheduleRelationship = (
        ms.StopTimeUpdateScheduleRelationship.SCHEDULED
    )
    departure_occupancy_status: ms.OccupancyStatus = (
        ms.OccupancyStatus.NO_DATA_AVAILABLE
    )


def _extract_core_trip_id(gtfs_rt_trip_id: str) -> str:
    """Extracts the core trip ID by removing potential update suffixes (like '#...')."""
    return gtfs_rt_trip_id.split("#")[0]


def trip_to_model(trip: pb.TripDescriptor) -> ms.TripDescriptor:
    trip_id = _extract_core_trip_id(trip.trip_id)
    start_date = trip.start_date
    start_time = trip.start_time
    schedule_relationship: pb.TripDescriptor.ScheduleRelationship | None = getattr(
        trip, "schedule_relationship", None
    )
    route_id: str | None = getattr(trip, "route_id", None)
    direction_id: int | None = getattr(trip, "direction_id", None)
    
    return ms.TripDescriptor(
        trip_id=trip_id,
        start_time=start_time,
        start_date=start_date,
        route_id=route_id,
        direction_id=_DIRECTION_ID_MAP.get(direction_id, None),
        schedule_relationship=_TRIP_DESCRIPTOR_SCHEDULE_RELATIONSHIP_MAP.get(
            schedule_relationship, None
        ),
    )


def stop_time_update_to_intermediate_model(
    stop_time_update: pb.TripUpdate.StopTimeUpdate,
) -> IntermediateStopTimeUpdate:
    def clean(value):
        """Convert 0 or missing values to None."""
        return None if value in (0, None) else value

    def normalize_times(scheduled_time, time, delay):
        """
        Ensure all three fields (scheduled_time, time, delay) are filled if possible.
        0 values are treated as None.
        """
        scheduled_time = clean(scheduled_time)
        time = clean(time)
        delay = delay  # NOTE: 0 seconds delay is a valid value

        if time is not None and delay is not None and scheduled_time is None:
            scheduled_time = time - delay
        elif time is not None and scheduled_time is not None and delay is None:
            delay = time - scheduled_time
        elif scheduled_time is not None and delay is not None and time is None:
            time = scheduled_time + delay

        return scheduled_time, time, delay

    stop_sequence: int | None = getattr(stop_time_update, "stop_sequence", None)
    stop_id: str | None = getattr(stop_time_update, "stop_id", None)
    schedule_relationship: pb.TripUpdate.StopTimeUpdate.ScheduleRelationship | None = (
        getattr(stop_time_update, "schedule_relationship", None)
    )

    # Arrival
    arrival_time = getattr(stop_time_update.arrival, "time", None)
    scheduled_arrival_time = getattr(stop_time_update.arrival, "scheduled_time", None)
    arrival_delay = getattr(stop_time_update.arrival, "delay", None)
    scheduled_arrival_time, arrival_time, arrival_delay = normalize_times(
        scheduled_arrival_time, arrival_time, arrival_delay
    )

    # Departure
    departure_time = getattr(stop_time_update.departure, "time", None)
    scheduled_departure_time = getattr(
        stop_time_update.departure, "scheduled_time", None
    )
    departure_delay = getattr(stop_time_update.departure, "delay", None)
    scheduled_departure_time, departure_time, departure_delay = normalize_times(
        scheduled_departure_time, departure_time, departure_delay
    )

    departure_occupancy_status: pb.VehiclePosition.OccupancyStatus | None = getattr(
        stop_time_update, "departure_occupancy_status", None
    )

    return IntermediateStopTimeUpdate(
        stop_sequence=stop_sequence,
        stop_id=stop_id,
        schedule_relationship=_STOP_TIME_SCHEDULE_RELATIONSHIP_MAP.get(
            schedule_relationship, ms.StopTimeUpdateScheduleRelationship.SCHEDULED
        ),
        scheduled_arrival_time=scheduled_arrival_time,
        arrival_time=arrival_time,
        arrival_delay=arrival_delay,
        arrival_uncertainty=getattr(stop_time_update.arrival, "uncertainty", None),
        scheduled_departure_time=scheduled_departure_time,
        departure_time=departure_time,
        departure_delay=departure_delay,
        departure_uncertainty=getattr(stop_time_update.departure, "uncertainty", None),
        departure_occupancy_status=_OCCUPANCY_STATUS_MAP.get(
            departure_occupancy_status, ms.OccupancyStatus.NO_DATA_AVAILABLE
        ),
    )


def intermediate_stop_time_update_to_model(
    agency_timezone: str,
    date: str,
    isu: IntermediateStopTimeUpdate,
    existing_sti: Optional[ms.StopTimeInstance],
) -> ms.StopTimeInstance:
    """Convert intermediate stop time updates into a StopTimeUpdate model."""

    def resolve_datetime(new_time, existing_value):
        if new_time is not None:
            return convert_to_datetime(date, new_time, agency_timezone)
        return existing_value if existing_sti else None

    def resolve_value(new_value, existing_value):
        if new_value is not None:
            return new_value
        return existing_value if existing_sti else None

    return ms.StopTimeInstance(
        stop_id=isu.stop_id,
        stop_headsign=resolve_value(None, getattr(existing_sti, "stop_headsign", None)),
        pickup_type=resolve_value(None, getattr(existing_sti, "pickup_type", None)),
        drop_off_type=resolve_value(None, getattr(existing_sti, "drop_off_type", None)),
        timepoint=resolve_value(None, getattr(existing_sti, "timepoint", None)),
        shape_dist_traveled=resolve_value(
            None, getattr(existing_sti, "shape_dist_traveled", None)
        ),
        arrival_datetime=resolve_datetime(
            isu.arrival_time, getattr(existing_sti, "arrival_datetime", None)
        ),
        predicted_arrival_datetime=resolve_datetime(
            isu.arrival_time, getattr(existing_sti, "predicted_arrival_datetime", None)
        ),
        predicted_arrival_uncertainty=resolve_value(
            isu.arrival_uncertainty,
            getattr(existing_sti, "predicted_arrival_uncertainty", None),
        ),
        departure_datetime=resolve_datetime(
            isu.departure_time, getattr(existing_sti, "departure_datetime", None)
        ),
        predicted_departure_datetime=resolve_datetime(
            isu.departure_time,
            getattr(existing_sti, "predicted_departure_datetime", None),
        ),
        predicted_departure_uncertainty=resolve_value(
            isu.departure_uncertainty,
            getattr(existing_sti, "predicted_departure_uncertainty", None),
        ),
        schedule_relationship=isu.schedule_relationship,
    )
