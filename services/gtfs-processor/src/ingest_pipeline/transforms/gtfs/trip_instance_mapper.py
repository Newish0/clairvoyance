from typing import AsyncIterator, Dict, Any, List, Tuple
from ingest_pipeline.core.errors import ErrorPolicy
from models.enums import (
    Direction,
    StopTimeUpdateScheduleRelationship,
    TripInstanceState,
)
from models.mongo_schemas import (
    Agency,
    CalendarDate,
    Route,
    Shape,
    StopTimeInstance,
    Trip,
    StopTime,
    TripInstance,
)
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer
from utils.datetime import convert_to_datetime
from bson import ObjectId


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

    def __init__(self):
        pass

    async def run(
        self,
        context: Context,
        items: AsyncIterator[
            Tuple[Agency, CalendarDate, Trip, List[StopTime], Route, Shape]
        ],
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            agency, calendar_date, trip, stop_times, route, shape = row
            try:
                stop_time_infos = [
                    StopTimeInstance(
                        stop_id=stop_time.stop_id,
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
                        ),
                        departure_datetime=convert_to_datetime(
                            calendar_date.date,
                            stop_time.departure_time,
                            agency.agency_timezone,
                            context.logger,
                        ),
                        schedule_relationship=StopTimeUpdateScheduleRelationship.SCHEDULED,
                    )
                    for stop_time in stop_times
                ]

                trip_instance_doc = TripInstance(
                    agency_id=agency.agency_id,
                    trip_id=trip.trip_id,
                    start_date=calendar_date.date,
                    start_time=stop_times[0].arrival_time,
                    state=TripInstanceState.PRISTINE,
                    start_datetime=convert_to_datetime(
                        calendar_date.date,
                        stop_times[0].arrival_time,
                        agency.agency_timezone,
                        context.logger,
                    ),
                    stop_times=stop_time_infos,
                    trip=ObjectId(trip.id.binary),
                    route=ObjectId(route.id.binary),
                    shape=ObjectId(shape.id.binary),
                )

                # TODO: Run validation

                if await TripInstance.find_one(
                    TripInstance.agency_id == trip_instance_doc.agency_id,
                    TripInstance.trip_id == trip_instance_doc.trip_id,
                    TripInstance.start_date == trip_instance_doc.start_date,
                    TripInstance.start_time == trip_instance_doc.start_time,
                    TripInstance.state != TripInstanceState.PRISTINE,
                ):
                    raise Exception(
                        f"Trip instance already exists and it is not PRISTINE: {trip_instance_doc.agency_id}, {trip_instance_doc.trip_id}, {trip_instance_doc.start_date}, {trip_instance_doc.start_time}"
                    )

                yield UpdateOne(
                    {
                        "agency_id": trip_instance_doc.agency_id,
                        "trip_id": trip_instance_doc.trip_id,
                        "start_date": trip_instance_doc.start_date,
                        "start_time": trip_instance_doc.start_time,
                        "$or": [
                            {"state": TripInstanceState.PRISTINE},
                            {"state": {"$exists": False}},
                        ],
                    },
                    {
                        "$set": {
                            **trip_instance_doc.model_dump(exclude={"id"}),
                            # Do explicit linking
                            "trip": ObjectId(trip.id.binary),
                            "route": ObjectId(route.id.binary),
                            "shape": ObjectId(shape.id.binary),
                        }
                    },
                    upsert=True,
                )

            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr(f"trip_instance_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
