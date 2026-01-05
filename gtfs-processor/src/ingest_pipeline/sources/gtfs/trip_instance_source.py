from typing import AsyncIterator, Optional, Tuple, List

from cachetools import LRUCache
from sqlmodel import select, col

from ingest_pipeline.core.types import Context, Source
from generated.db_models import (
    Agencies,
    CalendarDates,
    Trips,
    Routes,
    Shapes,
    StopTimes,
    TripInstances,
)
from database.database_manager import DatabaseManager


class TripInstanceSource(
    Source[
        Tuple[
            Agencies,
            CalendarDates,
            Trips,
            StopTimes,
            Routes | None,
            Shapes | None,
        ]
    ]
):
    """
    Source that yields a unique trip instance based
      - trips
      - calendar dates
    in the database.
    """

    output_type: type[
        Tuple[
            Agencies,
            CalendarDates,
            Trips,
            StopTimes,
            Routes | None,
            Shapes | None,
        ]
    ] = Tuple[Agencies, CalendarDates, Trips, StopTimes, Routes | None, Shapes | None]

    def __init__(
        self,
        agency_id: str,
        min_date: str,
        max_date: str,
        db: DatabaseManager,
        cache_size: int = 1000,
    ):
        self.agency_id = agency_id
        self.min_date = min_date
        self.max_date = max_date
        self.db = db

        self._route_cache: LRUCache = LRUCache(maxsize=cache_size)
        self._shape_cache: LRUCache = LRUCache(maxsize=cache_size)
        self._stop_time_cache: LRUCache = LRUCache(maxsize=cache_size)

    async def _lookup_route(self, route_id: int) -> Optional[Routes]:
        """Get route by route PK ID with LRU caching."""
        if route_id in self._route_cache:
            return self._route_cache[route_id]

        # Cache miss - query database
        async with self.db.createSession() as session:
            stmt = select(Routes).where(Routes.id == route_id)

            route = await session.scalar(stmt)

        # Add to cache
        self._route_cache[route_id] = route
        return route

    async def _lookup_shape(self, shape_id: int) -> Optional[Shapes]:
        """Get shape by shape PK ID with LRU caching."""

        if shape_id in self._shape_cache:
            return self._shape_cache[shape_id]

        # Cache miss - query database
        async with self.db.createSession() as session:
            stmt = select(Shapes).where(Shapes.id == shape_id)

            shape = await session.scalar(stmt)

        # Add to cache
        self._shape_cache[shape_id] = shape
        return shape

    async def _lookup_stop_time(self, trip_id: int) -> StopTimes | None:
        """Get stop times by trip PK ID with LRU caching."""
        if trip_id in self._stop_time_cache:
            return self._stop_time_cache[trip_id]

        # Cache miss - query database
        async with self.db.createSession() as session:
            stmt = select(StopTimes).where(
                StopTimes.trip_id == trip_id,
                StopTimes.stop_sequence == 1,
            )
            stop_time = await session.scalar(stmt)

        # Add to cache
        self._stop_time_cache[trip_id] = stop_time
        return stop_time

    async def _lookup_agency(self) -> Optional[Agencies]:
        """Lookup agency by agency_id."""
        async with self.db.createSession() as session:
            stmt = select(Agencies).where(Agencies.id == self.agency_id)
            agency = await session.scalar(stmt)
        return agency

    async def stream(
        self, context: Context
    ) -> AsyncIterator[
        Tuple[
            Agencies,
            CalendarDates,
            Trips,
            StopTimes,
            Routes | None,
            Shapes | None,
        ]
    ]:
        agency = await self._lookup_agency()
        if not agency:
            raise ValueError(f"Agency not found: agency_id={self.agency_id}")

        async with self.db.createSession() as session:
            calendar_dates_stream = await session.stream_scalars(
                select(CalendarDates).where(
                    CalendarDates.agency_id == self.agency_id,
                    CalendarDates.date >= self.min_date,
                    CalendarDates.date <= self.max_date,
                )
            )
            async for calendar_date in calendar_dates_stream:
                trips_stream = await session.stream_scalars(
                    select(Trips).where(
                        Trips.agency_id == self.agency_id,
                        Trips.service_sid == calendar_date.service_sid,
                    )
                )

                async for trip in trips_stream:
                    # Use cached queries
                    stop_time = await self._lookup_stop_time(trip.id)
                    route = (
                        (await self._lookup_route(trip.route_id))
                        if trip.route_id is not None
                        else None
                    )
                    shape = (
                        (await self._lookup_shape(trip.shape_id))
                        if trip.shape_id is not None
                        else None
                    )

                    # HACK: Skip if no stop times. This is a limitation right now...
                    if not stop_time:
                        context.logger.info(
                            f"Skipping trip instance {self.agency_id} {trip.id} {calendar_date.date} because it has no stop times."
                        )
                        context.telemetry.incr(
                            "trip_instance_source.no_stop_times_skip"
                        )
                        continue

                    # Do not make changes to existing trip instances that are not pristine. Skip them.
                    exist_not_pristine = (
                        await session.exec(
                            select(1)
                            .where(
                                TripInstances.trip_id == trip.id,
                                TripInstances.start_date == calendar_date.date,
                                TripInstances.start_time == stop_time.arrival_time,
                                TripInstances.state != "PRISTINE",
                            )
                            .limit(1)
                        )
                    ).first() is not None

                    if exist_not_pristine:
                        context.logger.info(
                            f"Skipping trip instance {self.agency_id} {trip.id} {calendar_date.date} {stop_time.arrival_time} because it is not pristine."
                        )
                        context.telemetry.incr("trip_instance_source.not_pristine_skip")
                        continue

                    yield (agency, calendar_date, trip, stop_time, route, shape)
