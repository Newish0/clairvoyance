from typing import AsyncIterator, List, Tuple

from bson import DBRef
from pymongo import UpdateOne

from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.types import Context, Transformer
from models.enums import (
    StopTimeUpdateScheduleRelationship,
    TripInstanceState,
)
from models.mongo_schemas import (
    Agency,
    CalendarDate,
    Route,
    Shape,
    StopTime,
    StopTimeInstance,
    Trip,
    TripInstance,
    CalendarExceptionType,
)
from utils.datetime import convert_to_datetime


class TripInstanceMapper(
    Transformer[
        Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape], UpdateOne
    ]
):
    """
    Maps unique trip instances into MongoDB UpdateOne operations
    Input: Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape]
    Output: pymongo UpdateOne
    """

    input_type: type[
        Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape]
    ] = Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape]
    output_type: type[UpdateOne] = UpdateOne

    def __init__(self):
        pass

    async def run(
        self,
        context: Context,
        inputs: AsyncIterator[
            Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape]
        ],
    ) -> AsyncIterator[UpdateOne]:
        async for row in inputs:
            agency, calendar_date, trip, stop_times, route, shape = row
            try:
                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the parent model (which includes this model) immediately after.
                stop_time_infos = [
                    StopTimeInstance(
                        stop_id=stop_time.stop_id,  # type: ignore
                        stop_headsign=stop_time.stop_headsign,
                        pickup_type=stop_time.pickup_type,
                        drop_off_type=stop_time.drop_off_type,
                        timepoint=stop_time.timepoint,
                        shape_dist_traveled=stop_time.shape_dist_traveled,
                        arrival_datetime=convert_to_datetime(
                            calendar_date.date,
                            stop_time.arrival_time,
                            agency.agency_timezone,
                            context.logger,
                        ),  # type: ignore
                        departure_datetime=convert_to_datetime(
                            calendar_date.date,
                            stop_time.departure_time,
                            agency.agency_timezone,
                            context.logger,
                        ),  # type: ignore
                        schedule_relationship=StopTimeUpdateScheduleRelationship.SCHEDULED,
                    )
                    for stop_time in stop_times
                ]

                state = TripInstanceState.PRISTINE
                if calendar_date.exception_type == CalendarExceptionType.REMOVED:
                    state = TripInstanceState.REMOVED

                trip_instance_doc = TripInstance(
                    agency_id=agency.agency_id,
                    trip_id=trip.trip_id,
                    start_date=calendar_date.date,
                    start_time=stop_times[0].arrival_time,
                    route_id=route.route_id,
                    direction_id=trip.direction_id,
                    state=state,
                    start_datetime=convert_to_datetime(
                        calendar_date.date,
                        stop_times[0].arrival_time,
                        agency.agency_timezone,
                        context.logger,
                    ),  # type: ignore
                    stop_times=stop_time_infos,
                    # Static type checkers being stupid...
                    trip=trip,  # type: ignore
                    route=route,  # type: ignore
                    shape=shape,  # type: ignore
                )

                await trip_instance_doc.validate_self()

                yield UpdateOne(
                    {
                        "agency_id": trip_instance_doc.agency_id,
                        "trip_id": trip_instance_doc.trip_id,
                        "start_date": trip_instance_doc.start_date,
                        "start_time": trip_instance_doc.start_time,
                        # Check to make sure we only update PRISTINE documents
                        "$or": [
                            {"state": TripInstanceState.PRISTINE},
                            {"state": {"$exists": False}},
                        ],
                    },
                    {
                        "$set": {
                            **trip_instance_doc.model_dump(exclude={"id"}),
                            # Do explicit linking... and static type checkers being stupid...
                            "trip": DBRef(collection=Trip.Settings.name, id=trip.id),  # type: ignore
                            "route": DBRef(collection=Route.Settings.name, id=route.id),  # type: ignore
                            "shape": DBRef(collection=Shape.Settings.name, id=shape.id),  # type: ignore
                        }
                    },
                    upsert=True,
                )

            except Exception as e:
                context.handle_error(e, "trip_instance_mapper.error")
