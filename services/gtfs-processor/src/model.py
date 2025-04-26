import datetime
import re
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any

import pytz  # Required for timezone handling
from beanie import Document, Indexed
from pydantic import BaseModel, Field, model_validator, ConfigDict

from domain import ScheduleRelationship, OccupancyStatus


# --- Helper Pydantic Models (for Beanie/MongoDB compatibility) ---
# Using Pydantic BaseModel is generally preferred for Beanie documents
class StopTimeInfo(BaseModel):
    stop_id: str
    stop_sequence: int
    arrival_time: Optional[str] = None # HH:MM:SS format
    departure_time: Optional[str] = None # HH:MM:SS format
    stop_headsign: Optional[str] = None
    pickup_type: Optional[int] = None
    drop_off_type: Optional[int] = None
    shape_dist_traveled: Optional[float] = None

class Position(BaseModel):
    latitude: float
    longitude: float
    timestamp: datetime.datetime # Expecting timezone-aware UTC
    bearing: Optional[float] = None
    speed: Optional[float] = None # meters per second

class RealtimeStopTimeUpdate(BaseModel):
    stop_sequence: int
    stop_id: str # From scheduled data, for reference
    arrival_delay: Optional[int] = None # seconds
    predicted_arrival_time: Optional[datetime.datetime] = None # TZ-aware UTC
    departure_delay: Optional[int] = None # seconds
    predicted_departure_time: Optional[datetime.datetime] = None # TZ-aware UTC
    schedule_relationship: ScheduleRelationship = ScheduleRelationship.SCHEDULED


# --- Main Beanie Document ---
class ScheduledTripDocument(Document):
    """
    Represents a specific instance of a vehicle trip, persisted in MongoDB using Beanie.
    Includes precomputed fields for efficient querying.
    """
    # Pydantic v2 config to allow extra fields if needed during creation from dict
    # model_config = ConfigDict(extra='allow')

    # --- Core Identifiers (Indexed for fast lookups) ---
    # Unique compound index for the logical trip instance
    trip_id: Indexed(str)
    start_date: Indexed(str) # YYYYMMDD
    start_time: Indexed(str) # HH:MM:SS (Scheduled start time)

    # --- Other Static GTFS Data ---
    route_id: Indexed(str)
    service_id: str
    agency_timezone_str: str = "UTC"
    direction_id: Optional[int] = None
    shape_id: Optional[str] = None
    trip_headsign: Optional[str] = None
    trip_short_name: Optional[str] = None
    block_id: Optional[str] = None
    scheduled_stop_times: List[StopTimeInfo] = Field(default_factory=list)

    # --- Real-time Data Fields ---
    realtime_schedule_relationship: ScheduleRelationship = (
        ScheduleRelationship.SCHEDULED
    )
    # MongoDB object keys must be strings. If using dict, ensure keys are str.
    # Alternatively, store as List[RealtimeStopTimeUpdate] if dict key isn't critical for queries
    realtime_stop_updates: Dict[str, RealtimeStopTimeUpdate] = Field(
        default_factory=dict
    ) # Key: str(stop_sequence)
    vehicle_id: Optional[Indexed(str)] = None # Index if querying by vehicle
    current_occupancy: Optional[OccupancyStatus] = None
    last_realtime_update_timestamp: Optional[Indexed(datetime.datetime)] = None # TZ-aware UTC, index for recency queries

    # --- Position Data ---
    current_position: Optional[Position] = None
    position_history: List[Position] = Field(default_factory=list) # Consider capping size or using TTL if grows too large

    # --- DERIVED & PERSISTED FIELD FOR PERFORMANCE ---
    # These fields are calculated *before* saving using the validator below.
    start_datetime: Optional[Indexed(datetime.datetime)] = Field(default=None)


    # --- Methods ---
    @staticmethod
    def _parse_hhmmss(time_str: Optional[str]) -> Optional[Tuple[int, int, int]]:
        """Parses HH:MM:SS, handling >23 hours. Returns (h, m, s) or None."""
        if not time_str:
            return None
        # Relax regex slightly to handle potential leading/trailing whitespace
        match = re.match(r"\s*(\d+):([0-5]\d):([0-5]\d)\s*", time_str)
        if match:
            return int(match.group(1)), int(match.group(2)), int(match.group(3))
        print(f"Warning: Could not parse time string: '{time_str}'") # Add logging
        return None

    @model_validator(mode='before') # Pydantic v2+
    @classmethod
    def precompute_start_datetime(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Precomputes the start_datetime based on start_date, start_time,
        and agency_timezone_str before validation/saving.
        Stores the result in UTC.
        """
        start_date_str = values.get('start_date')
        start_time_str = values.get('start_time')
        tz_str = values.get('agency_timezone_str', 'UTC') # Default to UTC if missing
        computed_dt = None # Initialize

        if start_date_str and start_time_str:
            try:
                parsed_st = cls._parse_hhmmss(start_time_str)
                if parsed_st:
                    h, m, s = parsed_st
                    base_date = datetime.datetime.strptime(start_date_str, "%Y%m%d").date()
                    days_offset = h // 24
                    actual_hour = h % 24
                    actual_date = base_date + datetime.timedelta(days=days_offset)

                    # Get the timezone object
                    try:
                        agency_tz = pytz.timezone(tz_str)
                    except pytz.UnknownTimeZoneError:
                        print(f"Warning: Unknown timezone '{tz_str}', using UTC.")
                        agency_tz = pytz.utc

                    # Create naive datetime first
                    naive_dt = datetime.datetime(
                        actual_date.year, actual_date.month, actual_date.day, actual_hour, m, s
                    )

                    # Localize to agency timezone (handles DST etc.)
                    # Use is_dst=None for ambiguous/non-existent times during DST transitions
                    local_dt = agency_tz.localize(naive_dt, is_dst=None)

                    # Convert to UTC for consistent storage and querying
                    computed_dt = local_dt.astimezone(pytz.utc)

            except ValueError as e:
                # Handle potential parsing errors (e.g., invalid date format)
                print(f"Error computing start datetime for {values.get('trip_id')}: {e}")
                # Keep computed_dt as None
            except Exception as e:
                # Catch unexpected errors during calculation
                print(f"Unexpected error computing start datetime for {values.get('trip_id')}: {e}")
                # Keep computed_dt as None

        # Add the computed value (or None if calculation failed) to the data
        values['start_datetime'] = computed_dt
        return values

    # --- Beanie Settings ---
    class Settings:
        name = "scheduled_trips" # MongoDB collection name
        # Optional: Add more complex indexes if needed
        # indexes = [
        #     [
        #         ("trip_id", 1),
        #         ("start_date", 1),
        #         ("start_time", 1),
        #     ], # Unique compound index defined via Indexed() now
        #     ("route_id", 1),
        #     ("computed_start_datetime_utc", -1), # Example descending index
        #     ("last_realtime_update_timestamp", -1),
        # ]
        # Keep beanie v1 simple Index definitions via Indexed() decorator
