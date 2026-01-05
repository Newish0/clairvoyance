from typing import AsyncIterator, Optional, Tuple

from sqlmodel import select

from ingest_pipeline.core.types import Context, Source
from generated.db_models import (
    Agencies,
    StopTimes,
    TripInstances,
)
from database.database_manager import DatabaseManager


class StopTimeInstanceSource(Source[Tuple[Agencies, TripInstances, StopTimes]]):
    """
    Source that yields a unique stop time instance based on trip instances
    """

    output_type: type[
        Tuple[
            Agencies,
            TripInstances,
            StopTimes,
        ]
    ] = Tuple[
        Agencies,
        TripInstances,
        StopTimes,
    ]

    def __init__(
        self,
        agency_id: str,
        min_date: str,
        max_date: str,
        db: DatabaseManager,
    ):
        self.agency_id = agency_id
        self.min_date = min_date
        self.max_date = max_date
        self.db = db

    async def _lookup_agency(self) -> Optional[Agencies]:
        """Lookup agency by agency_id."""
        async with self.db.createSession() as session:
            stmt = select(Agencies).where(Agencies.id == self.agency_id)
            agency = await session.scalar(stmt)
        return agency

    async def stream(
        self, context: Context
    ) -> AsyncIterator[Tuple[Agencies, TripInstances, StopTimes]]:
        try:
            agency = await self._lookup_agency()
            if not agency:
                raise ValueError(f"Agency not found: agency_id={self.agency_id}")
        except Exception as e:
            context.handle_error(e, "stop_time_instance_source.error.lookup_agency")
            return

        async with self.db.createSession() as session:
            trip_instances_stream = await session.stream_scalars(
                select(TripInstances).where(
                    TripInstances.agency_id == self.agency_id,
                    TripInstances.start_date >= self.min_date,
                    TripInstances.start_date <= self.max_date,
                )
            )
            async for trip_instance in trip_instances_stream:
                try:
                    stop_times_stream = await session.stream_scalars(
                        select(StopTimes).where(
                            StopTimes.trip_id == trip_instance.id,
                        )
                    )
                    async for stop_time in stop_times_stream:
                        yield (agency, trip_instance, stop_time)
                except Exception as e:
                    context.handle_error(
                        e, "stop_time_instance_source.error.stream_stop_times"
                    )
