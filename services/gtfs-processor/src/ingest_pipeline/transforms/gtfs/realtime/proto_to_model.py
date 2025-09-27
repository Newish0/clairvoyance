from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import models.mongo_schemas as ms
from lib import gtfs_realtime_pb2 as pb
from utils.datetime import localize_unix_time

# Mapping dictionaries
_TRIP_DESCRIPTOR_SCHEDULE_RELATIONSHIP_MAP = {
    pb.TripDescriptor.ScheduleRelationship.SCHEDULED: ms.TripDescriptorScheduleRelationship.SCHEDULED,
    pb.TripDescriptor.ScheduleRelationship.ADDED: ms.TripDescriptorScheduleRelationship.ADDED,
    pb.TripDescriptor.ScheduleRelationship.UNSCHEDULED: ms.TripDescriptorScheduleRelationship.UNSCHEDULED,
    pb.TripDescriptor.ScheduleRelationship.CANCELED: ms.TripDescriptorScheduleRelationship.CANCELED,
    pb.TripDescriptor.ScheduleRelationship.REPLACEMENT: ms.TripDescriptorScheduleRelationship.REPLACEMENT,
    pb.TripDescriptor.ScheduleRelationship.DUPLICATED: ms.TripDescriptorScheduleRelationship.DUPLICATED,
    pb.TripDescriptor.ScheduleRelationship.DELETED: ms.TripDescriptorScheduleRelationship.DELETED,
    pb.TripDescriptor.ScheduleRelationship.NEW: ms.TripDescriptorScheduleRelationship.NEW,
    None: None,
}

_DIRECTION_ID_MAP = {
    0: ms.Direction.OUTBOUND,
    1: ms.Direction.INBOUND,
    None: None,
}

_STOP_TIME_SCHEDULE_RELATIONSHIP_MAP = {
    pb.TripUpdate.StopTimeUpdate.ScheduleRelationship.SCHEDULED: ms.StopTimeUpdateScheduleRelationship.SCHEDULED,
    pb.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED: ms.StopTimeUpdateScheduleRelationship.SKIPPED,
    pb.TripUpdate.StopTimeUpdate.ScheduleRelationship.NO_DATA: ms.StopTimeUpdateScheduleRelationship.NO_DATA,
    pb.TripUpdate.StopTimeUpdate.ScheduleRelationship.UNSCHEDULED: ms.StopTimeUpdateScheduleRelationship.UNSCHEDULED,
    None: None,
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
    None: None,
}

_PICKUP_DROP_OFF_MAP = {
    pb.TripUpdate.StopTimeUpdate.StopTimeProperties.DropOffPickupType.REGULAR: ms.PickupDropOff.REGULAR,
    pb.TripUpdate.StopTimeUpdate.StopTimeProperties.DropOffPickupType.NONE: ms.PickupDropOff.NO_PICKUP_OR_DROP_OFF,
    pb.TripUpdate.StopTimeUpdate.StopTimeProperties.DropOffPickupType.PHONE_AGENCY: ms.PickupDropOff.PHONE_AGENCY,
    pb.TripUpdate.StopTimeUpdate.StopTimeProperties.DropOffPickupType.COORDINATE_WITH_DRIVER: ms.PickupDropOff.COORDINATE_WITH_DRIVER,
    None: None,
}

_WHEELCHAIR_BOARDING_MAP = {
    pb.VehicleDescriptor.WheelchairAccessible.UNKNOWN: ms.WheelchairBoarding.NO_INFO,
    pb.VehicleDescriptor.WheelchairAccessible.WHEELCHAIR_ACCESSIBLE: ms.WheelchairBoarding.ACCESSIBLE,
    pb.VehicleDescriptor.WheelchairAccessible.WHEELCHAIR_INACCESSIBLE: ms.WheelchairBoarding.NOT_ACCESSIBLE,
    None: None,
}

_VEHICLE_STOP_STATUS_MAP = {
    pb.VehiclePosition.VehicleStopStatus.INCOMING_AT: ms.VehicleStopStatus.INCOMING_AT,
    pb.VehiclePosition.VehicleStopStatus.STOPPED_AT: ms.VehicleStopStatus.STOPPED_AT,
    pb.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO: ms.VehicleStopStatus.IN_TRANSIT_TO,
    None: None,
}

_CONGESTION_LEVEL_MAP = {
    pb.VehiclePosition.CongestionLevel.UNKNOWN_CONGESTION_LEVEL: ms.CongestionLevel.UNKNOWN_CONGESTION_LEVEL,
    pb.VehiclePosition.CongestionLevel.RUNNING_SMOOTHLY: ms.CongestionLevel.RUNNING_SMOOTHLY,
    pb.VehiclePosition.CongestionLevel.STOP_AND_GO: ms.CongestionLevel.STOP_AND_GO,
    pb.VehiclePosition.CongestionLevel.CONGESTION: ms.CongestionLevel.CONGESTION,
    pb.VehiclePosition.CongestionLevel.SEVERE_CONGESTION: ms.CongestionLevel.SEVERE_CONGESTION,
    None: None,
}


@dataclass(frozen=True)
class ParsedStopTimeUpdate:
    """Parsed and normalized stop time update data."""

    stop_id: Optional[str]
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


def trip_descriptor_to_model(trip: pb.TripDescriptor) -> ms.TripDescriptor:
    """Convert protobuf TripDescriptor to model TripDescriptor."""
    return ms.TripDescriptor(
        trip_id=_extract_core_trip_id(trip.trip_id)
        if trip.HasField("trip_id")
        else None,
        start_time=getattr(trip, "start_time", None),
        start_date=getattr(trip, "start_date", None),
        route_id=getattr(trip, "route_id", None),
        direction_id=_DIRECTION_ID_MAP.get(getattr(trip, "direction_id", None), None),
        schedule_relationship=_TRIP_DESCRIPTOR_SCHEDULE_RELATIONSHIP_MAP.get(
            getattr(trip, "schedule_relationship", None), None
        ),
    )


def _clean_time_value(value: int | None) -> int | None:
    """Convert 0 or missing values to None."""
    return None if value in (0, None) else value


def _normalize_times(
    scheduled_time: int | None,
    time: int | None,
    delay: int | None,
    fallback_scheduled_time: int | None = None,
) -> tuple[int | None, int | None, int | None]:
    """
    Fill the 3 fields scheduled_time, time, delay based on the other two.
    May not be able to fill all three if missing 2 of the 3.
    0 values are treated as None.
    """
    scheduled_time = _clean_time_value(scheduled_time) or fallback_scheduled_time
    time = _clean_time_value(time)
    # NOTE: 0 seconds delay is a valid value, so don't clean it

    if time is not None and delay is not None and scheduled_time is None:
        scheduled_time = time - delay
    elif time is not None and scheduled_time is not None and delay is None:
        delay = time - scheduled_time
    elif scheduled_time is not None and delay is not None and time is None:
        time = scheduled_time + delay

    return scheduled_time, time, delay


def _extract_time_fields(
    time_event, existing_time: Optional[int] = None
) -> tuple[int | None, int | None, int | None]:
    """Extract and normalize time fields from arrival/departure event."""
    scheduled_time = getattr(time_event, "scheduled_time", None)
    time = getattr(time_event, "time", None)
    delay = getattr(time_event, "delay", None)

    return _normalize_times(scheduled_time, time, delay, existing_time)


def _parse_stop_time_update(
    stop_time_update: pb.TripUpdate.StopTimeUpdate,
    existing_arrival_time: Optional[int] = None,
    existing_departure_time: Optional[int] = None,
) -> ParsedStopTimeUpdate:
    """Parse protobuf StopTimeUpdate into normalized data structure."""

    # Extract basic fields
    stop_sequence = getattr(stop_time_update, "stop_sequence", None)
    stop_id = getattr(stop_time_update, "stop_id", None)
    schedule_relationship = getattr(stop_time_update, "schedule_relationship", None)
    departure_occupancy_status = getattr(
        stop_time_update, "departure_occupancy_status", None
    )

    # Extract and normalize arrival times
    scheduled_arrival_time, arrival_time, arrival_delay = _extract_time_fields(
        stop_time_update.arrival, existing_arrival_time
    )

    # Extract and normalize departure times
    scheduled_departure_time, departure_time, departure_delay = _extract_time_fields(
        stop_time_update.departure, existing_departure_time
    )

    return ParsedStopTimeUpdate(
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


def _create_new_stop_time_instance(
    stop_time_update: pb.TripUpdate.StopTimeUpdate,
    parsed_stu: ParsedStopTimeUpdate,
    agency_timezone: str,
) -> ms.StopTimeInstance:
    """Create a new StopTimeInstance from parsed data."""
    return ms.StopTimeInstance(
        stop_id=stop_time_update.stop_id,
        stop_headsign=stop_time_update.stop_time_properties.stop_headsign,
        pickup_type=_PICKUP_DROP_OFF_MAP.get(
            stop_time_update.stop_time_properties.pickup_type
        ),
        drop_off_type=_PICKUP_DROP_OFF_MAP.get(
            stop_time_update.stop_time_properties.drop_off_type
        ),
        timepoint=ms.Timepoint.EXACT,
        shape_dist_traveled=None,
        arrival_datetime=localize_unix_time(
            parsed_stu.scheduled_arrival_time,  # type: ignore
            agency_timezone,
        ),
        predicted_arrival_datetime=localize_unix_time(
            parsed_stu.arrival_time, agency_timezone
        )
        if parsed_stu.arrival_time
        else None,
        predicted_arrival_uncertainty=parsed_stu.arrival_uncertainty,
        departure_datetime=localize_unix_time(
            parsed_stu.scheduled_departure_time,  # type: ignore
            agency_timezone,
        ),
        predicted_departure_datetime=localize_unix_time(
            parsed_stu.departure_time, agency_timezone
        )
        if parsed_stu.departure_time
        else None,
        predicted_departure_uncertainty=parsed_stu.departure_uncertainty,
        schedule_relationship=parsed_stu.schedule_relationship,
    )


def _update_existing_stop_time_instance(
    existing_sti: ms.StopTimeInstance,
    parsed_stu: ParsedStopTimeUpdate,
    agency_timezone: str,
) -> None:
    """Update existing StopTimeInstance with new data."""

    # Update schedule relationship
    if parsed_stu.schedule_relationship is not None:
        existing_sti.schedule_relationship = parsed_stu.schedule_relationship

    # Update arrival times
    if parsed_stu.scheduled_arrival_time is not None:
        existing_sti.arrival_datetime = localize_unix_time(
            parsed_stu.scheduled_arrival_time, agency_timezone
        )

    if parsed_stu.arrival_time is not None:
        existing_sti.predicted_arrival_datetime = localize_unix_time(
            parsed_stu.arrival_time, agency_timezone
        )

    if parsed_stu.arrival_uncertainty is not None:
        existing_sti.predicted_arrival_uncertainty = parsed_stu.arrival_uncertainty

    # Update departure times
    if parsed_stu.scheduled_departure_time is not None:
        existing_sti.departure_datetime = localize_unix_time(
            parsed_stu.scheduled_departure_time, agency_timezone
        )

    if parsed_stu.departure_time is not None:
        existing_sti.predicted_departure_datetime = localize_unix_time(
            parsed_stu.departure_time, agency_timezone
        )

    if parsed_stu.departure_uncertainty is not None:
        existing_sti.predicted_departure_uncertainty = parsed_stu.departure_uncertainty


def stop_time_update_to_model(
    stop_time_update: pb.TripUpdate.StopTimeUpdate,
    agency_timezone: str,
    existing_sti: Optional[ms.StopTimeInstance],
    existing_stop_sequence: Optional[int] = None,
) -> tuple[Optional[int], ms.StopTimeInstance]:
    """Convert protobuf StopTimeUpdate into a StopTimeInstance model."""

    # Extract existing times for normalization
    existing_arrival_time = (
        int(existing_sti.arrival_datetime.timestamp())
        if existing_sti and existing_sti.arrival_datetime
        else None
    )
    existing_departure_time = (
        int(existing_sti.departure_datetime.timestamp())
        if existing_sti and existing_sti.departure_datetime
        else None
    )

    parsed_stu = _parse_stop_time_update(
        stop_time_update, existing_arrival_time, existing_departure_time
    )

    new_seq = (
        parsed_stu.stop_sequence
        if parsed_stu.stop_sequence is not None
        else existing_stop_sequence
    )

    if existing_sti is None:
        # Create new stop time instance
        new_sti = _create_new_stop_time_instance(
            stop_time_update, parsed_stu, agency_timezone
        )
        return (new_seq, new_sti)
    else:
        # Update existing stop time instance
        _update_existing_stop_time_instance(existing_sti, parsed_stu, agency_timezone)
        return (new_seq, existing_sti)


def vehicle_descriptor_to_model(
    vehicle: pb.VehicleDescriptor,
    agency_id: str,
) -> ms.Vehicle:
    """Convert protobuf VehicleDescriptor to model Vehicle."""
    return ms.Vehicle(
        agency_id=agency_id,
        vehicle_id=getattr(vehicle, "id", ""),
        label=getattr(vehicle, "label", None),
        license_plate=getattr(vehicle, "license_plate", None),
        wheelchair_accessible=_WHEELCHAIR_BOARDING_MAP.get(
            getattr(vehicle, "wheelchair_accessible", None)
        ),
        positions=[],
    )


def vehicle_position_to_model(
    vehicle_position: pb.VehiclePosition,
    trip: ms.TripInstance | None,
    timestamp: datetime,
    agency_id: str,
) -> ms.VehiclePosition:
    """Convert protobuf VehiclePosition to model VehiclePosition."""
    position = getattr(vehicle_position, "position", None)
    latitude = getattr(position, "latitude", None) if position else None
    longitude = getattr(position, "longitude", None) if position else None
    bearing = getattr(position, "bearing", None) if position else None
    odometer = getattr(position, "odometer", None) if position else None
    speed = getattr(position, "speed", None) if position else None

    return ms.VehiclePosition(
        agency_id=agency_id,
        vehicle_id=vehicle_position.vehicle.id,
        timestamp=timestamp,
        stop_id=getattr(vehicle_position, "stop_id", None),
        current_stop_sequence=getattr(vehicle_position, "current_stop_sequence", None),
        current_status=_VEHICLE_STOP_STATUS_MAP.get(
            getattr(vehicle_position, "stop_status", None)
        ),
        congestion_level=_CONGESTION_LEVEL_MAP.get(
            getattr(vehicle_position, "congestion_level", None),
        ),
        occupancy_status=_OCCUPANCY_STATUS_MAP.get(
            getattr(vehicle_position, "occupancy_status", None)
        ),
        occupancy_percentage=getattr(vehicle_position, "occupancy_percentage", None),
        latitude=latitude,
        longitude=longitude,
        bearing=bearing,
        odometer=odometer,
        speed=speed,
        trip=trip,  # type: ignore
    )
