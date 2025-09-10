from typing import AsyncIterator, Optional, Tuple, Union, List
from cachetools import LRUCache
from models.mongo_schemas import Agency, CalendarDate, Route, Shape, Trip, StopTime
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

    async def _get_shape_cached(self, shape_id: str) -> Optional[Shape]:
        """Get shape with LRU caching."""
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
            async for calendarDate in CalendarDate.find(
                CalendarDate.agency_id == self.agency_id,
                CalendarDate.service_id == trip.service_id,
            ):

                # Use cached queries
                stop_times = await self._get_stop_times_cached(trip.trip_id)
                route = await self._get_route_cached(trip.route_id)
                shape = await self._get_shape_cached(trip.shape_id)

                yield (agency, calendarDate, trip, stop_times, route, shape)
