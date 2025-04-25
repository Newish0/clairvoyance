
import datetime
import pytz  # Using pytz for robust timezone handling
from typing import List, Optional, Dict, Any, Tuple, ClassVar
from dataclasses import dataclass, field
from enum import Enum
import re  # For parsing HH:MM:SS


# --- Enums ---
class ScheduleRelationship(Enum):
    SCHEDULED = 0
    ADDED = 1
    UNSCHEDULED = 2
    CANCELED = 3
    DUPLICATED = 5


class OccupancyStatus(Enum):
    EMPTY = 0
    MANY_SEATS_AVAILABLE = 1
    FEW_SEATS_AVAILABLE = 2
    STANDING_ROOM_ONLY = 3
    CRUSHED_STANDING_ROOM_ONLY = 4
    FULL = 5
    NOT_ACCEPTING_PASSENGERS = 6
    NO_DATA = -1


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
    schedule_relationship: ScheduleRelationship = ScheduleRelationship.SCHEDULED


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
    start_time: str  # HH:MM:SS (Scheduled start time of the trip instance)

    # --- Other Static GTFS Data ---
    route_id: str
    service_id: str
    agency_timezone_str: str = "UTC"  # Default, should be set by parser from agency.txt
    direction_id: Optional[int] = None
    shape_id: Optional[str] = None
    trip_headsign: Optional[str] = None
    trip_short_name: Optional[str] = None
    block_id: Optional[str] = None
    scheduled_stop_times: List[StopTimeInfo] = field(default_factory=list)

    # --- Real-time Data Fields ---
    realtime_schedule_relationship: ScheduleRelationship = (
        ScheduleRelationship.SCHEDULED
    )
    realtime_stop_updates: Dict[int, RealtimeStopTimeUpdate] = field(
        default_factory=dict
    )  # Key: stop_sequence
    vehicle_id: Optional[str] = None
    current_occupancy: Optional[OccupancyStatus] = None
    last_realtime_update_timestamp: Optional[datetime.datetime] = None  # TZ-aware UTC

    # --- Position Data ---
    current_position: Optional[Position] = None
    position_history: List[Position] = field(default_factory=list)
    MAX_POSITION_HISTORY: ClassVar[int] = 100  # Limit history size

    # --- Methods ---
    def get_unique_identifier(self) -> Tuple[str, str, str]:
        return (self.trip_id, self.start_date, self.start_time)

    def get_scheduled_stop_time_info(
        self, stop_sequence: int
    ) -> Optional[StopTimeInfo]:
        """Finds the scheduled StopTimeInfo for a given stop_sequence."""
        # Could be optimized with a dictionary if performance is critical
        for st_info in self.scheduled_stop_times:
            if st_info.stop_sequence == stop_sequence:
                return st_info
        return None

    @staticmethod
    def _parse_hhmmss(time_str: Optional[str]) -> Optional[Tuple[int, int, int]]:
        """Parses HH:MM:SS, handling >23 hours. Returns (h, m, s) or None."""
        if not time_str:
            return None
        match = re.match(r"(\d+):([0-5]\d):([0-5]\d)", time_str)
        if match:
            return int(match.group(1)), int(match.group(2)), int(match.group(3))
        return None

    def _get_scheduled_datetime_utc(
        self, stop_sequence: int, arrival_or_departure: str  # 'arrival' or 'departure'
    ) -> Optional[datetime.datetime]:
        """Calculates the scheduled datetime for a stop in aware UTC."""
        st_info = self.get_scheduled_stop_time_info(stop_sequence)
        if not st_info:
            return None

        time_str = (
            st_info.arrival_time
            if arrival_or_departure == "arrival"
            else st_info.departure_time
        )
        parsed_time = self._parse_hhmmss(time_str)
        if not parsed_time:
            return None

        h, m, s = parsed_time
        try:
            # Combine start_date with the time from stop_times.txt
            # Handle >23 hours by adding days to the start_date
            base_date = datetime.datetime.strptime(self.start_date, "%Y%m%d").date()
            days_offset = h // 24
            actual_hour = h % 24
            actual_date = base_date + datetime.timedelta(days=days_offset)

            # Create naive datetime in agency's timezone
            agency_tz = pytz.timezone(self.agency_timezone_str)
            naive_dt = datetime.datetime(
                actual_date.year, actual_date.month, actual_date.day, actual_hour, m, s
            )
            # Localize to agency timezone, then convert to UTC
            local_dt = agency_tz.localize(naive_dt)
            utc_dt = local_dt.astimezone(pytz.utc)
            return utc_dt
        except (ValueError, pytz.UnknownTimeZoneError) as e:
            print(
                f"Error creating scheduled datetime for T:{self.trip_id} D:{self.start_date} Seq:{stop_sequence}: {e}"
            )
            return None

    def update_from_trip_update(
        self, trip_update_data: Dict[str, Any], rt_timestamp: datetime.datetime
    ):
        """
        Updates the ScheduledTrip with data from a parsed GTFS-RT TripUpdate.
        Expects rt_timestamp to be timezone-aware (ideally UTC).
        """
        self.last_realtime_update_timestamp = rt_timestamp
        self.vehicle_id = trip_update_data.get("vehicle_id", self.vehicle_id)

        rt_sched_rel_str = trip_update_data.get("schedule_relationship")
        if rt_sched_rel_str:
            try:
                # Handle both string names and integer values from proto
                if isinstance(rt_sched_rel_str, str):
                    self.realtime_schedule_relationship = ScheduleRelationship[
                        rt_sched_rel_str
                    ]
                elif isinstance(rt_sched_rel_str, int):
                    self.realtime_schedule_relationship = ScheduleRelationship(
                        rt_sched_rel_str
                    )
            except (KeyError, ValueError):
                print(
                    f"Warning: Unknown trip schedule relationship '{rt_sched_rel_str}' for T:{self.trip_id}"
                )

        # Process stop time updates
        for stu_data in trip_update_data.get("stop_time_updates", []):
            seq = stu_data.get("stop_sequence")
            if seq is None:
                print(
                    f"Warning: StopTimeUpdate missing stop_sequence for T:{self.trip_id}"
                )
                continue

            # Find the corresponding scheduled stop info to get the stop_id
            scheduled_st_info = self.get_scheduled_stop_time_info(seq)
            if not scheduled_st_info:
                # This could be an ADDED stop or bad data
                print(
                    f"Warning: No scheduled stop info found for T:{self.trip_id} Seq:{seq}. Assuming ADDED or ignoring."
                )
                # If you need to handle ADDED stops properly, you'd need more logic here,
                # possibly using the stop_id provided in stu_data if available.
                current_stop_id = stu_data.get("stop_id", f"UNKNOWN_SEQ_{seq}")
            else:
                current_stop_id = scheduled_st_info.stop_id

            # Get or create the RealtimeStopTimeUpdate object
            rt_stop_update = self.realtime_stop_updates.get(seq)
            if not rt_stop_update:
                rt_stop_update = RealtimeStopTimeUpdate(
                    stop_sequence=seq, stop_id=current_stop_id
                )
                self.realtime_stop_updates[seq] = rt_stop_update

            # Update schedule relationship for the stop
            stu_sched_rel_str = stu_data.get("schedule_relationship")
            if stu_sched_rel_str is not None:
                try:
                    if isinstance(stu_sched_rel_str, str):
                        rt_stop_update.schedule_relationship = ScheduleRelationship[
                            stu_sched_rel_str
                        ]
                    elif isinstance(stu_sched_rel_str, int):
                        rt_stop_update.schedule_relationship = ScheduleRelationship(
                            stu_sched_rel_str
                        )
                except (KeyError, ValueError):
                    print(
                        f"Warning: Unknown stop schedule relationship '{stu_sched_rel_str}' for T:{self.trip_id} Seq:{seq}"
                    )

            # --- Process Arrival ---
            arrival_data = stu_data.get("arrival", {})
            rt_stop_update.arrival_delay = arrival_data.get(
                "delay", rt_stop_update.arrival_delay
            )
            # Use explicit time if provided, otherwise calculate from delay
            if "time" in arrival_data:
                # Assume GTFS-RT time is Unix timestamp (int/float)
                try:
                    arr_ts = float(arrival_data["time"])
                    rt_stop_update.predicted_arrival_time = (
                        datetime.datetime.fromtimestamp(arr_ts, tz=pytz.utc)
                    )
                    # Optionally recalculate delay based on predicted and scheduled
                    sched_arr = self._get_scheduled_datetime_utc(seq, "arrival")
                    if sched_arr and rt_stop_update.predicted_arrival_time:
                        rt_stop_update.arrival_delay = int(
                            (
                                rt_stop_update.predicted_arrival_time - sched_arr
                            ).total_seconds()
                        )

                except (TypeError, ValueError):
                    print(
                        f"Warning: Invalid arrival time format '{arrival_data['time']}' for T:{self.trip_id} Seq:{seq}"
                    )
            elif rt_stop_update.arrival_delay is not None:
                # Calculate predicted time from delay
                sched_arr = self._get_scheduled_datetime_utc(seq, "arrival")
                if sched_arr:
                    rt_stop_update.predicted_arrival_time = (
                        sched_arr
                        + datetime.timedelta(seconds=rt_stop_update.arrival_delay)
                    )
                else:
                    rt_stop_update.predicted_arrival_time = None  # Cannot calculate
            else:
                # No arrival info provided
                rt_stop_update.predicted_arrival_time = None

            # --- Process Departure (similar to arrival) ---
            departure_data = stu_data.get("departure", {})
            rt_stop_update.departure_delay = departure_data.get(
                "delay", rt_stop_update.departure_delay
            )
            if "time" in departure_data:
                try:
                    dep_ts = float(departure_data["time"])
                    rt_stop_update.predicted_departure_time = (
                        datetime.datetime.fromtimestamp(dep_ts, tz=pytz.utc)
                    )
                    sched_dep = self._get_scheduled_datetime_utc(seq, "departure")
                    if sched_dep and rt_stop_update.predicted_departure_time:
                        rt_stop_update.departure_delay = int(
                            (
                                rt_stop_update.predicted_departure_time - sched_dep
                            ).total_seconds()
                        )

                except (TypeError, ValueError):
                    print(
                        f"Warning: Invalid departure time format '{departure_data['time']}' for T:{self.trip_id} Seq:{seq}"
                    )
            elif rt_stop_update.departure_delay is not None:
                sched_dep = self._get_scheduled_datetime_utc(seq, "departure")
                if sched_dep:
                    rt_stop_update.predicted_departure_time = (
                        sched_dep
                        + datetime.timedelta(seconds=rt_stop_update.departure_delay)
                    )
                else:
                    rt_stop_update.predicted_departure_time = None  # Cannot calculate
            else:
                rt_stop_update.predicted_departure_time = None

    def update_from_vehicle_position(self, vehicle_position_data: Dict[str, Any]):
        """
        Updates the ScheduledTrip with data from a parsed GTFS-RT VehiclePosition.
        Expects timestamp within position_data to be timezone-aware (ideally UTC).
        """
        # Vehicle ID might be here instead of TripUpdate sometimes
        self.vehicle_id = vehicle_position_data.get("vehicle_id", self.vehicle_id)

        pos_data = vehicle_position_data.get("position")
        vp_timestamp_unix = vehicle_position_data.get(
            "timestamp"
        )  # GTFS-RT standard timestamp

        # Use VP timestamp if available and more recent, otherwise keep existing
        current_ts = self.last_realtime_update_timestamp
        new_ts = None
        if vp_timestamp_unix is not None:
            try:
                new_ts = datetime.datetime.fromtimestamp(
                    float(vp_timestamp_unix), tz=pytz.utc
                )
                if current_ts is None or new_ts > current_ts:
                    self.last_realtime_update_timestamp = new_ts
            except (TypeError, ValueError):
                print(
                    f"Warning: Invalid vehicle position timestamp '{vp_timestamp_unix}' for V:{self.vehicle_id} T:{self.trip_id}"
                )
                new_ts = current_ts  # Use previous if new one is bad

        else:
            # If VP message has no timestamp, we can't reliably use its position etc.
            # but maybe occupancy is still useful? Or rely on TripUpdate timestamp.
            print(
                f"Warning: VehiclePosition missing timestamp for V:{self.vehicle_id} T:{self.trip_id}"
            )
            new_ts = current_ts  # Fallback to last known update time

        if pos_data and "latitude" in pos_data and "longitude" in pos_data and new_ts:
            new_position = Position(
                latitude=float(pos_data["latitude"]),
                longitude=float(pos_data["longitude"]),
                timestamp=new_ts,  # Use the validated, timezone-aware timestamp
                bearing=(
                    float(pos_data["bearing"])
                    if pos_data.get("bearing") is not None
                    else None
                ),
                speed=(
                    float(pos_data["speed"])
                    if pos_data.get("speed") is not None
                    else None
                ),
            )
            # Only update if position is newer or different
            if (
                self.current_position is None
                or new_position.timestamp > self.current_position.timestamp
            ):
                self.current_position = new_position
                self.position_history.append(new_position)
                # Trim history
                if len(self.position_history) > self.MAX_POSITION_HISTORY:
                    self.position_history = self.position_history[
                        -self.MAX_POSITION_HISTORY :
                    ]
        elif pos_data:
            print(
                f"Warning: VehiclePosition for V:{self.vehicle_id} T:{self.trip_id} has 'position' but lacks lat/lon or timestamp."
            )

        occupancy_str = vehicle_position_data.get("occupancy_status")
        if occupancy_str is not None:
            try:
                if isinstance(occupancy_str, str):
                    self.current_occupancy = OccupancyStatus[occupancy_str]
                elif isinstance(occupancy_str, int):
                    self.current_occupancy = OccupancyStatus(occupancy_str)
                else:
                    self.current_occupancy = OccupancyStatus.NO_DATA
            except (KeyError, ValueError):
                print(
                    f"Warning: Unknown occupancy status '{occupancy_str}' for V:{self.vehicle_id} T:{self.trip_id}"
                )
                self.current_occupancy = OccupancyStatus.NO_DATA
        # If occupancy is not present in message, we keep the old value
