from typing import AsyncIterator, Optional, Tuple, List
from cachetools import LRUCache
from models.enums import TripInstanceState
from models.mongo_schemas import (
    Agency,
    CalendarDate,
    Route,
    Shape,
    Trip,
    StopTime,
    TripInstance,
)
from ingest_pipeline.core.types import Context, Source


class TripInstanceSource(
    Source[Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape]]
):
    """
    Source that yields a unique trip instance based
      - trips
      - calendar dates
    in the database.
    """

    output_type: type[
        Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape]
    ] = Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape]

    def __init__(
        self,
        agency_id: str,
        cache_size: int = 1000,
    ):
        self.agency_id = agency_id

        self._route_cache: LRUCache = LRUCache(maxsize=cache_size)
        self._shape_cache: LRUCache = LRUCache(maxsize=cache_size)
        self._stop_times_cache: LRUCache = LRUCache(maxsize=cache_size)

    async def _get_route_cached(self, route_id: str) -> Optional[Route]:
        """Get route with LRU caching."""
        if route_id in self._route_cache:
            return self._route_cache[route_id]

        # Cache miss - query database
        route = await Route.find_one(
            Route.agency_id == self.agency_id, Route.route_id == route_id
        )

        # Add to cache (LRU eviction handled automatically)
        self._route_cache[route_id] = route
        return route

    async def _get_shape_cached(self, shape_id: str | None) -> Optional[Shape]:
        """Get shape with LRU caching."""
        if not shape_id:
            return None

        if shape_id in self._shape_cache:
            return self._shape_cache[shape_id]

        # Cache miss - query database
        shape = await Shape.find_one(
            Shape.agency_id == self.agency_id, Shape.shape_id == shape_id
        )

        # Add to cache (LRU eviction handled automatically)
        self._shape_cache[shape_id] = shape
        return shape

    async def _get_stop_times_cached(self, trip_id: str) -> List[StopTime]:
        """Get stop times with LRU caching."""
        if trip_id in self._stop_times_cache:
            return self._stop_times_cache[trip_id]

        # Cache miss - query database
        stop_times = (
            await StopTime.find(
                StopTime.agency_id == self.agency_id,
                StopTime.trip_id == trip_id,
            )
            .sort(StopTime.stop_sequence)
            .to_list()
        )

        # Add to cache (LRU eviction handled automatically)
        self._stop_times_cache[trip_id] = stop_times
        return stop_times

    async def stream(
        self, context: Context
    ) -> AsyncIterator[Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape]]:
        agency = await Agency.find_one(Agency.agency_id == self.agency_id)

        async for trip in Trip.find(
            Trip.agency_id == self.agency_id,
        ):
            async for calendar_date in CalendarDate.find(
                CalendarDate.agency_id == self.agency_id,
                CalendarDate.service_id == trip.service_id,
            ):
                # Use cached queries
                stop_times = await self._get_stop_times_cached(trip.trip_id)
                route = await self._get_route_cached(trip.route_id)
                shape = await self._get_shape_cached(trip.shape_id)

                # Do not make changes to existing trip instances that are not pristine. Skip them.
                exist_not_pristine = await TripInstance.find_one(
                    TripInstance.agency_id == self.agency_id,
                    TripInstance.trip_id == trip.trip_id,
                    TripInstance.start_date == calendar_date.date,
                    TripInstance.start_time == stop_times[0].arrival_time,
                    TripInstance.state != TripInstanceState.PRISTINE,
                ).exists()

                if exist_not_pristine:
                    context.logger.info(
                        f"Skipping trip instance {self.agency_id} {trip.trip_id} {calendar_date.date} {stop_times[0].arrival_time} because it is not pristine."
                    )
                    context.telemetry.incr("trip_instance_source.not_pristine_skip")
                    continue

                yield (agency, calendar_date, trip, stop_times, route, shape)
