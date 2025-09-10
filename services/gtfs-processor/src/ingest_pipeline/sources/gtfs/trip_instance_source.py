import asyncio
from pathlib import Path
from typing import AsyncIterator, Tuple, Union, List
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
    ):
        self.agency_id = agency_id

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

                stop_times = (
                    await StopTime.find(
                        StopTime.agency_id == self.agency_id,
                        StopTime.trip_id == trip.trip_id,
                    )
                    .sort(StopTime.stop_sequence)
                    .to_list()
                )

                route = await Route.find_one(
                    Route.agency_id == self.agency_id, Route.route_id == trip.route_id
                )

                shape = await Shape.find_one(
                    Shape.agency_id == self.agency_id, Shape.shape_id == trip.shape_id
                )

                yield (agency, calendarDate, trip, stop_times, route, shape)
