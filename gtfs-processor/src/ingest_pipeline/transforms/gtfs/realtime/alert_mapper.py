from typing import AsyncIterator

from beanie.operators import And, Or
from pymongo import UpdateOne
from datetime import datetime, timezone

from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.transforms.gtfs.gtfs_realtime_protobuf_mapper import ParsedEntity
from ingest_pipeline.transforms.gtfs.realtime.proto_to_model import (
    TripDescriptor,
    alert_to_model,
    entity_selector_to_partial_model,
    time_range_to_model,
)
from models.mongo_schemas import (
    Agency,
    TripInstance,
)


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

        base_conditions = And(
            TripInstance.agency_id == self.agency_id,
            TripInstance.trip_id == trip_descriptor.trip_id,
            TripInstance.start_date == trip_descriptor.start_date,
        )

        if trip_descriptor.start_time:
            base_conditions = And(
                base_conditions,
                TripInstance.start_time == trip_descriptor.start_time,
            )

        return await TripInstance.find_one(
            base_conditions,
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
        timestamp = datetime.fromtimestamp(parsed_entity.timestamp, tz=timezone.utc)

        active_periods = [time_range_to_model(period) for period in alert.active_period]

        partial_informed_entities = [
            entity_selector_to_partial_model(ie, agency.agency_id)
            for ie in alert.informed_entity
        ]

        # Link trips: match descriptor to trip instance
        informed_entities = []
        for pie, trip_desc in partial_informed_entities:
            if trip_desc is not None:
                trip = await self._find_existing_trip_instance(trip_desc)
                if trip is not None:
                    pie.trip_instance = trip.id
                else:
                    context.logger.warning(
                        f"Trip instance from descriptor {trip_desc} not found for alert. Skipping alert."
                    )
                    context.telemetry.incr("alerts.trip_not_found.skipped")
                    continue
            informed_entities.append(pie)

        try:
            alert_doc = alert_to_model(
                alert, active_periods, informed_entities, self.agency_id, timestamp
            )
            await alert_doc.validate_self()
        except Exception as e:
            context.handle_error(e, "alert_mapper.error.validation_failed")
            return

        alert_doc_update_dict = alert_doc.model_dump(exclude={"id"})

        update_op = UpdateOne(
            {"content_hash": alert_doc.content_hash},
            {"$set": alert_doc_update_dict},
            upsert=True,
        )
        return update_op
