import datetime
from typing import AsyncIterator, Dict, Optional

from sqlmodel import select

from generated.db_models import Stops, StopTimes, Trips
from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation
from database.database_manager import DatabaseManager
from utils.convert import safe_float, safe_int


class StopTimeMapper(Transformer[Dict[str, str], UpsertOperation]):
    """
    Maps GTFS stop_times.txt rows (dict) into UpsertOperations for the
    relational `StopTimes` table. Resolves foreign key relationships for
    trip_id and stop_id.

    Input: Dict[str, str]
    Output: UpsertOperation
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpsertOperation] = UpsertOperation

    __PICKUP_DROP_OFF_MAPPING = {
        "0": "REGULAR",
        "1": "NO_PICKUP_OR_DROP_OFF",
        "2": "PHONE_AGENCY",
        "3": "COORDINATE_WITH_DRIVER",
        None: None,
    }

    __TIMEPOINT_MAPPING = {
        "0": "APPROXIMATE",
        "1": "EXACT",
        None: None,
    }

    def __init__(self, agency_id: str, db: DatabaseManager):
        self.agency_id = agency_id
        self.db = db
        # Cache for FK lookups
        self._trip_cache: Dict[str, Optional[int]] = {}
        self._stop_cache: Dict[str, Optional[int]] = {}

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpsertOperation]:
        async for row in inputs:
            try:
                trip_sid = row.get("trip_id")
                stop_sid = row.get("stop_id")

                # Lookup trip_id if needed
                trip_id = None
                if trip_sid:
                    if trip_sid not in self._trip_cache:
                        context.telemetry.incr(
                            "stop_time_mapper.trip_lookup_cache_miss"
                        )
                        trip_id = await self._lookup_trip(context, trip_sid)
                        self._trip_cache[trip_sid] = trip_id
                    else:
                        context.telemetry.incr("stop_time_mapper.trip_lookup_cache_hit")
                        trip_id = self._trip_cache[trip_sid]

                # Lookup stop_id if needed
                stop_id = None
                if stop_sid:
                    if stop_sid not in self._stop_cache:
                        context.telemetry.incr(
                            "stop_time_mapper.stop_lookup_cache_miss"
                        )
                        stop_id = await self._lookup_stop(context, stop_sid)
                        self._stop_cache[stop_sid] = stop_id
                    else:
                        context.telemetry.incr("stop_time_mapper.stop_lookup_cache_hit")
                        stop_id = self._stop_cache[stop_sid]

                stop_sequence_raw = row.get("stop_sequence")
                stop_sequence = (
                    safe_int(stop_sequence_raw)
                    if stop_sequence_raw not in (None, "")
                    else None
                )

                shape_dist_traveled_raw = row.get("shape_dist_traveled")
                shape_dist_traveled = (
                    safe_float(shape_dist_traveled_raw)
                    if shape_dist_traveled_raw not in (None, "")
                    else None
                )

                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the model immediately after.
                stop_time_model = StopTimes(
                    agency_id=self.agency_id,
                    trip_sid=trip_sid,  # type: ignore
                    stop_sid=stop_sid,  # type: ignore
                    stop_sequence=stop_sequence,  # type: ignore
                    trip_id=trip_id,
                    stop_id=stop_id,
                    arrival_time=row.get("arrival_time"),
                    departure_time=row.get("departure_time"),
                    stop_headsign=row.get("stop_headsign"),
                    pickup_type=self.__PICKUP_DROP_OFF_MAPPING.get(
                        row.get("pickup_type")
                    ),
                    drop_off_type=self.__PICKUP_DROP_OFF_MAPPING.get(
                        row.get("drop_off_type")
                    ),
                    timepoint=self.__TIMEPOINT_MAPPING.get(row.get("timepoint")),
                    shape_dist_traveled=shape_dist_traveled,
                )

                yield UpsertOperation(
                    model=StopTimes,
                    values=stop_time_model.model_dump(),
                    conflict_columns=["agency_id", "trip_sid", "stop_sequence"],
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("stop_time_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e

    async def _lookup_trip(self, context: Context, trip_sid: str) -> Optional[int]:
        """Lookup trip ID by trip_sid."""
        try:
            async with self.db.createSession() as session:
                stmt = select(Trips).where(
                    Trips.agency_id == self.agency_id,
                    Trips.trip_sid == trip_sid,
                )
                trip = await session.scalar(stmt)

            if trip:
                return trip.id
            else:
                context.logger.warning(
                    f"Trip not found: agency_id={self.agency_id}, trip_sid={trip_sid}"
                )
                return None
        except Exception as e:
            context.logger.error(f"Error looking up trip: {e}")
            raise

    async def _lookup_stop(self, context: Context, stop_sid: str) -> Optional[int]:
        """Lookup stop ID by stop_sid."""
        try:
            async with self.db.createSession() as session:
                stmt = select(Stops).where(
                    Stops.agency_id == self.agency_id,
                    Stops.stop_sid == stop_sid,
                )
                stop = await session.scalar(stmt)

            if stop:
                return stop.id
            else:
                context.logger.warning(
                    f"Stop not found: agency_id={self.agency_id}, stop_sid={stop_sid}"
                )
                return None
        except Exception as e:
            context.logger.error(f"Error looking up stop: {e}")
            raise
