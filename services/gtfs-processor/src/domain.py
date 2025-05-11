import datetime
import pytz  # Using pytz for robust timezone handling
from typing import List, Optional, Dict, Any, Tuple, ClassVar
from dataclasses import dataclass, field
from enum import Enum
import re  # For parsing HH:MM:SS
from models import (
    TripDescriptorScheduleRelationship,
    OccupancyStatus,
    VehicleStopStatus,
)


# --- Helper Dataclasses ---
@dataclass(frozen=True)
class StopTimeInfo:
    stop_id: str
    stop_sequence: int
    arrival_time: Optional[str]  # HH:MM:SS format
    departure_time: Optional[str]  # HH:MM:SS format
    stop_headsign: Optional[str] = None
    pickup_type: Optional[int] = None
    drop_off_type: Optional[int] = None
    shape_dist_traveled: Optional[float] = None

    # --- DERIVED FIELDS ---
    arrival_datetime: Optional[datetime.datetime] = None


@dataclass(frozen=True)
class Position:
    latitude: float
    longitude: float
    timestamp: datetime.datetime  # Expecting timezone-aware UTC
    bearing: Optional[float] = None
    speed: Optional[float] = None  # meters per second


@dataclass
class RealtimeStopTimeUpdate:
    stop_sequence: int
    stop_id: str  # From scheduled data, for reference
    arrival_delay: Optional[int] = None  # seconds
    predicted_arrival_time: Optional[datetime.datetime] = None  # TZ-aware UTC
    departure_delay: Optional[int] = None  # seconds
    predicted_departure_time: Optional[datetime.datetime] = None  # TZ-aware UTC
    schedule_relationship: TripDescriptorScheduleRelationship = (
        TripDescriptorScheduleRelationship.SCHEDULED
    )


# --- Main ScheduledTrip Class (Domain Object) ---
@dataclass
class ScheduledTrip:
    """
    Represents a specific instance of a vehicle trip (domain object).
    Used by the parser and potentially business logic. Decoupled from persistence.
    """

    # --- Core Identifiers ---
    trip_id: str
    start_date: str  # YYYYMMDD
    start_time: str  # HH:MM:SS (Scheduled start time of the trip instance; Could be over 24:00:00)

    # --- Other Static GTFS Data ---
    route_id: str
    service_id: str
    route_short_name: Optional[str] = None
    agency_timezone_str: str = "UTC"  # Default, should be set by parser from agency.txt
    direction_id: Optional[int] = None
    shape_id: Optional[str] = None
    trip_headsign: Optional[str] = None
    trip_short_name: Optional[str] = None
    block_id: Optional[str] = None
    scheduled_stop_times: List[StopTimeInfo] = field(default_factory=list)

    # --- Real-time Data Fields ---
    realtime_schedule_relationship: TripDescriptorScheduleRelationship = (
        TripDescriptorScheduleRelationship.SCHEDULED
    )
    realtime_stop_updates: Dict[int, RealtimeStopTimeUpdate] = field(
        default_factory=dict
    )  # Key: stop_sequence
    current_stop_sequence: Optional[int] = None

    # The exact status of the vehicle with respect to the current stop.
    # Ignored if current_stop_sequence is missing.
    current_status: Optional[VehicleStopStatus] = None

    vehicle_id: Optional[str] = None
    current_occupancy: Optional[OccupancyStatus] = None
    last_realtime_update_timestamp: Optional[datetime.datetime] = None  # TZ-aware UTC

    # --- Position Data ---
    current_position: Optional[Position] = None
    position_history: List[Position] = field(default_factory=list)

    # -- Derived Fields ---
    @property
    def start_datetime(self) -> datetime.datetime:
        return ScheduledTrip.convert_to_datetime(
            self.start_date, self.start_time, self.agency_timezone_str
        )

    # --- Methods ---
    def get_unique_identifier(self) -> Tuple[str, str, str]:
        return (self.trip_id, self.start_date, self.start_time)

    @staticmethod
    def convert_to_datetime(
        date_str: str, time_str: str, tz_str: str = "UTC"
    ) -> datetime.datetime:
        parsed_time = ScheduledTrip._parse_hhmmss(time_str)
        if not parsed_time:
            return None
        h, m, s = parsed_time

        base_date = datetime.datetime.strptime(date_str, "%Y%m%d").date()
        days_offset = h // 24
        actual_hour = h % 24
        actual_date = base_date + datetime.timedelta(days=days_offset)

        # Create naive datetime in given timezone
        tz = pytz.timezone(tz_str)
        naive_dt = datetime.datetime(
            actual_date.year, actual_date.month, actual_date.day, actual_hour, m, s
        )
        # Localize to given timezone
        local_dt = tz.localize(naive_dt)

        return local_dt

    @staticmethod
    def _parse_hhmmss(time_str: Optional[str]) -> Optional[Tuple[int, int, int]]:
        """Parses HH:MM:SS, handling >23 hours. Returns (h, m, s) or None."""
        if not time_str:
            return None
        match = re.match(r"(\d+):([0-5]\d):([0-5]\d)", time_str)
        if match:
            return int(match.group(1)), int(match.group(2)), int(match.group(3))
        return None
