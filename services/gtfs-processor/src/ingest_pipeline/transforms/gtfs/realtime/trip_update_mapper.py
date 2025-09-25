from typing import AsyncIterator

from pymongo import UpdateOne
from bson import ObjectId

from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.transforms.gtfs.gtfs_realtime_protobuf_mapper import ParsedEntity
from ingest_pipeline.transforms.gtfs.realtime.proto_to_model import (
    trip_descriptor_to_model,
)
from models.enums import TripDescriptorScheduleRelationship
from models.mongo_schemas import (
    Agency,
    TripInstance,
    TripInstanceState,
    Trip,
    Shape,
    Route,
)
from ingest_pipeline.transforms.gtfs.realtime.proto_to_model import (
    stop_time_update_to_model,
)


class TripUpdateMapper(Transformer[ParsedEntity, UpdateOne]):
    """ """

    input_type: type[ParsedEntity] = ParsedEntity
    output_type: type[UpdateOne] = UpdateOne

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[ParsedEntity]
    ) -> AsyncIterator[UpdateOne]:
        agency = await Agency.find_one(Agency.agency_id == self.agency_id)

        if not agency:
            # TODO: Error or log here based on strategy
            return

        async for parsed_entity in inputs:
            entity = parsed_entity.entity
            timestamp = parsed_entity.timestamp

            parsed_entity.entity.stop

            # Only process trip updates because this is the TripUpdateMapper
            if not entity.HasField("trip_update"):
                continue

            tu = entity.trip_update

            if not self._has_required_trip_fields(tu):
                continue  # TODO: Error or log here based on strategy

            trip_descriptor = trip_descriptor_to_model(tu.trip)

            trip_instance = await TripInstance.find_one(
                TripInstance.agency_id == self.agency_id,
                TripInstance.trip_id == trip_descriptor.trip_id,
                TripInstance.start_date == trip_descriptor.start_date,
                TripInstance.start_time == trip_descriptor.start_time,
            )

            if (
                not trip_instance
                and trip_descriptor.schedule_relationship
                != TripDescriptorScheduleRelationship.NEW
            ):
                # If we don't have a matching trip instance, and this trip update is not for a new trip, skip it.
                # TODO: Error or log here based on strategy
                continue

            stop_times = [
                stop_time_update_to_model(
                    stu,
                    agency.agency_timezone,
                    next(
                        filter(
                            lambda x: x.stop_id == stu.stop_id,
                            trip_instance.stop_times,
                        ),
                        None,
                    )
                    if trip_instance
                    else None,
                )
                for stu in tu.stop_time_update
            ]

            stop_times.sort(key=lambda x: x[0] if x[0] is not None else float("inf"))

            print(
                f"Processed Trip Update for trip_id: {trip_descriptor.trip_id}, start_date: {trip_descriptor.start_date}, start_time: {trip_descriptor.start_time}"
            )

            if not trip_instance:
                trip = await Trip.find_one(
                    Trip.trip_id == trip_descriptor.trip_id
                    and Trip.agency_id == self.agency_id
                )

                route = await Route.find_one(
                    Route.agency_id == self.agency_id,
                    Route.route_id == trip_descriptor.route_id,
                )

                # Create trip instance if it doesn't exist and the schedule relationship is NEW
                trip_instance = TripInstance(
                    agency_id=self.agency_id,
                    trip_id=trip_descriptor.trip_id,  # type: ignore
                    start_date=trip_descriptor.start_date,  # type: ignore
                    start_time=trip_descriptor.start_time,  # type: ignore
                    state=TripInstanceState.DIRTY,
                    start_datetime=stop_times[0][1].arrival_datetime,  # type: ignore
                    stop_times=[sti for _, sti in stop_times],
                    route=route,  # type: ignore
                    trip=trip,  # type: ignore
                )

                await trip_instance.validate_self()

                yield UpdateOne(
                    {
                        "agency_id": self.agency_id,
                        "trip_id": trip_descriptor.trip_id,
                        "start_date": trip_descriptor.start_date,
                        "start_time": trip_descriptor.start_time,
                    },
                    {
                        "$set": {
                            **trip_instance.model_dump(
                                exclude={"id", "route", "trip", "shape"}
                            ),
                            "trip": ObjectId(trip.id.binary),  # type: ignore
                            "route": ObjectId(route.id.binary),  # type: ignore
                        }
                    },
                )
            else:
                trip_instance.state = TripInstanceState.DIRTY
                trip_instance.stop_times = [sti for _, sti in stop_times]

                yield UpdateOne(
                    {
                        "agency_id": self.agency_id,
                        "trip_id": trip_descriptor.trip_id,
                        "start_date": trip_descriptor.start_date,
                        "start_time": trip_descriptor.start_time,
                    },
                    {
                        "$set": {
                            **trip_instance.model_dump(
                                exclude={"id", "route", "trip", "shape"}
                            ),
                        }
                    },
                )

    def _has_required_trip_fields(self, tu) -> bool:
        return (
            tu.HasField("trip")
            and tu.trip.HasField("trip_id")
            and tu.trip.HasField("start_date")
            and tu.trip.HasField("start_time")
        )
