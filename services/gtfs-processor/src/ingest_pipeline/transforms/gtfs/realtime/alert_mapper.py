from datetime import date

from bson import DBRef
from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.transforms.gtfs.gtfs_realtime_protobuf_mapper import ParsedEntity
from ingest_pipeline.transforms.gtfs.realtime.proto_to_model import (
    TripDescriptor,
    entity_selector_to_partial_model,
    trip_descriptor_to_model,
    vehicle_descriptor_to_model,
    vehicle_position_to_model,
    time_range_to_model,
    entity_selector_to_partial_model,
    alert_to_model,
)
from pymongo import UpdateOne
from typing import AsyncIterator
from models.mongo_schemas import (
    Agency,
    Alert,
    TripInstance,
)
from datetime import datetime
from utils.datetime import localize_unix_time
from beanie.operators import Or, And


class AlertMapper(Transformer[ParsedEntity, UpdateOne]):
    """Maps GTFS-RT alert entities to MongoDB update operations."""

    input_type: type[ParsedEntity] = ParsedEntity
    output_type: type[UpdateOne] = UpdateOne

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[ParsedEntity]
    ) -> AsyncIterator[UpdateOne]:
        agency = await self._get_agency(context)

        if not agency:
            context.handle_error(
                Exception(f"Agency {self.agency_id} not found"),
                "alert_mapper.error.agency_not_found",
            )
            return

        async for parsed_entity in inputs:
            if not self._has_alert_message(parsed_entity.entity):
                continue

            try:
                update_op = await self._process_alert(context, parsed_entity, agency)
                if update_op:
                    yield update_op
            except Exception as e:
                context.handle_error(e, "alert_mapper.error.processing_failed")

    def _has_alert_message(self, entity) -> bool:
        return entity.HasField("alert")

    async def _get_agency(self, context: Context) -> Agency | None:
        """Get agency by ID with error handling."""
        agency = await Agency.find_one(Agency.agency_id == self.agency_id)
        return agency

    async def _find_existing_trip_instance(
        self, trip_descriptor: TripDescriptor
    ) -> TripInstance | None:
        """Find existing trip instance matching the descriptor."""

        return await TripInstance.find_one(
            TripInstance.agency_id == self.agency_id,
            TripInstance.trip_id == trip_descriptor.trip_id,
            TripInstance.start_date == trip_descriptor.start_date,
            TripInstance.start_time == trip_descriptor.start_time,
            Or(
                TripInstance.trip_id == trip_descriptor.trip_id,
                And(
                    TripInstance.route_id == trip_descriptor.route_id,
                    TripInstance.direction_id == trip_descriptor.direction_id,
                ),
            ),
        )

    async def _process_alert(
        self, context: Context, parsed_entity: ParsedEntity, agency: Agency
    ) -> UpdateOne | None:
        alert = parsed_entity.entity.alert
        timestamp = localize_unix_time(parsed_entity.timestamp, agency.agency_timezone)

        active_periods = [
            time_range_to_model(period, agency.agency_timezone)
            for period in alert.active_period
        ]

        partial_informed_entities = [
            entity_selector_to_partial_model(ie, agency.agency_id)
            for ie in alert.informed_entity
        ]

        informed_entities = []
        for pie, trip_desc in partial_informed_entities:
            trip: TripInstance | None = None
            if trip_desc is not None:
                trip = await self._find_existing_trip_instance(trip_desc)
                pie.trip = trip  # type: ignore
            informed_entities.append(pie)

        alert_doc = alert_to_model(
            alert, active_periods, informed_entities, self.agency_id, timestamp
        )
        await alert_doc.validate_self()

        for ie in alert_doc.informed_entities:
            if ie.trip:
                ie.trip = DBRef(TripInstance.Settings.name, ie.trip.id)  # type: ignore

        alert_doc_update_dict = alert_doc.model_dump(exclude={"id", "content_hash"})

        update_op = UpdateOne(
            {"content_hash": alert_doc.content_hash},
            {"$set": alert_doc_update_dict},
            upsert=True,
        )
        return update_op
