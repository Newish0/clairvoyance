from dataclasses import dataclass
from typing import AsyncIterator, Type

from pymongo import UpdateOne
from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.transforms.gtfs.gtfs_realtime_protobuf_mapper import ParsedEntity
from ingest_pipeline.transforms.gtfs.proto_to_model import (
    intermediate_stop_time_update_to_model,
    stop_time_update_to_intermediate_model,
    trip_to_model,
)
from lib import gtfs_realtime_pb2 as pb
from ingest_pipeline.core.types import Context, Transformer
from models.enums import TripDescriptorScheduleRelationship, TripInstanceState
from models.mongo_schemas import Agency, TripInstance


class TripUpdateMapper(Transformer[ParsedEntity, UpdateOne]):
    """ """

    input_type: Type[ParsedEntity] = ParsedEntity
    output_type: Type[UpdateOne] = UpdateOne

    def __init__(self):
        pass

    async def get_agency_from_id(self, agency_id: str):
        agency = await Agency.find_one(Agency.agency_id == agency_id)
        # TODO: Cache results and error on not found
        return agency

    async def run(
        self, context: Context, inputs: AsyncIterator[ParsedEntity]
    ) -> AsyncIterator[UpdateOne]:
        async for parsed_entity in inputs:
            entity = parsed_entity.entity
            timestamp = parsed_entity.timestamp

            # Only process trip updates because this is the TripUpdateMapper
            if not entity.HasField("trip_update"):
                continue

            tu = entity.trip_update

            # TODO: Validating trip descriptor and trip_to_model SHOULD be done in
            # a generalized reusable mapping (transformer) stage.
            if not (
                tu.HasField("trip")
                and tu.trip.HasField("trip_id")
                and tu.trip.HasField("start_date")
                and tu.trip.HasField("start_time")
            ):
                # TODO: Error or log here
                continue

            trip_descriptor = trip_to_model(tu.trip)

            intermediate_stop_time_updates = sorted(
                (
                    [
                        stop_time_update_to_intermediate_model(stu)
                        for stu in tu.stop_time_update
                    ]
                    # if tu.HasField("stop_time_update")
                    # else []
                ),
                key=lambda stu: (stu.stop_sequence is None, stu.stop_sequence),
            )

            trip_instance = await TripInstance.find_one(
                TripInstance.agency_id
                == trip_descriptor.agency_id,  # TODO: We DO NEED TO PASS IN AGENCY ID FROM cli.py; trip descriptor does not have it
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
                # TODO: Error or log here
                continue

            # TODO: Create trip instance if it doesn't exist and the schedule relationship is NEW
            trip_instance = trip_instance or None

            agency = await self.get_agency_from_id(trip_descriptor.agency_id)

            trip_instance.stop_times = [
                intermediate_stop_time_update_to_model(
                    agency.agency_timezone,
                    trip_descriptor.start_date,
                    isu,
                    next(
                        filter(
                            lambda x: x.stop_id == isu.stop_id,
                            trip_instance.stop_times,
                        ),
                        None,
                    ),
                )
                for isu in intermediate_stop_time_updates
            ]

            yield UpdateOne(
                {
                    "agency_id": trip_descriptor.agency_id,
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
