from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import AsyncIterator

from beanie.operators import And, Or

from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.transforms.gtfs.gtfs_realtime_protobuf_mapper import ParsedEntity
from ingest_pipeline.transforms.gtfs.realtime.proto_to_model import (
    trip_descriptor_to_model,
    vehicle_descriptor_to_model,
    vehicle_position_to_model,
)
from models.mongo_schemas import (
    Agency,
    TripInstance,
    Vehicle,
    VehiclePosition,
)
from utils.datetime import localize_unix_time


class VehiclePositionMapper(Transformer[ParsedEntity, Callable[[], Awaitable]]):
    """Maps GTFS-RT vehicle position entities to update functions."""

    input_type: type[ParsedEntity] = ParsedEntity
    output_type: Callable[[], Awaitable] = type(Callable[[], Awaitable])

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[ParsedEntity]
    ) -> AsyncIterator[Callable[[], Awaitable]]:
        agency = await self._get_agency(context)
        if not agency:
            context.handle_error(
                Exception(f"Agency {self.agency_id} not found"),
                "vehicle_position_mapper.error.agency_not_found",
            )
            context.telemetry.incr("vehicle_position_mapper.error.agency_not_found")
            return

        async for parsed_entity in inputs:
            if not self._has_vehicle_message(parsed_entity.entity):
                continue

            try:
                update_fn = await self._process_vehicle_position(
                    context, parsed_entity, agency
                )

                # Skip if update_fn is None (indicates a skip due to already handled errors).
                if update_fn:
                    yield update_fn
            except Exception as e:
                context.handle_error(
                    e, "vehicle_position_mapper.error.processing_failed"
                )
                context.telemetry.incr(
                    "vehicle_position_mapper.error.processing_failed"
                )

    async def _get_agency(self, context: Context) -> Agency | None:
        """Get agency by ID with error handling."""
        agency = await Agency.find_one(Agency.agency_id == self.agency_id)
        return agency

    def _has_vehicle_message(self, entity) -> bool:
        """Check if entity has a vehicle message."""
        return entity.HasField("vehicle")

    async def _process_vehicle_position(
        self, context: Context, parsed_entity: ParsedEntity, agency: Agency
    ) -> Callable[[], Awaitable[None]] | None:
        """
        Process a single vehicle position entity.

        Returns:
        A MongoDB update operation or None to indicate a skip (e.g., due to errors)
        """
        entity = parsed_entity.entity
        entity_timestamp = parsed_entity.timestamp
        vehicle = entity.vehicle

        timestamp = self._get_localized_timestamp(vehicle, entity_timestamp, agency)
        existing_vehicle_position = await self._find_existing_vehicle_position(
            vehicle.vehicle.id, timestamp
        )

        if not self._should_process_vehicle_position(
            context, existing_vehicle_position, vehicle.vehicle.id, timestamp
        ):
            return None

        trip_descriptor = self._get_trip_descriptor(vehicle)
        trip_instance = await self._find_existing_trip_instance(trip_descriptor)
        vehicle_doc = await self._get_or_create_vehicle_document(vehicle)

        vehicle_position = vehicle_position_to_model(
            vehicle, trip_instance, timestamp, self.agency_id
        )

        if not self._has_meaningful_position_change(
            context,
            existing_vehicle_position,
            vehicle_position,
            vehicle.vehicle.id,
            timestamp,
        ):
            return None

        self._log_vehicle_position_processing(
            context,
            vehicle.vehicle.id,
            str(getattr(trip_instance, "id", "None")),
            timestamp,
        )

        return self._create_update_function(
            vehicle_position, vehicle_doc, trip_instance
        )

    def _get_localized_timestamp(
        self, vehicle, entity_timestamp: int, agency: Agency
    ) -> datetime:
        """Get localized timestamp from vehicle or entity."""
        timestamp = (
            vehicle.timestamp if vehicle.HasField("timestamp") else entity_timestamp
        )
        return localize_unix_time(timestamp, agency.agency_timezone)

    def _should_process_vehicle_position(
        self,
        context: Context,
        existing_vehicle_position: VehiclePosition | None,
        vehicle_id: str,
        timestamp: datetime,
    ) -> bool:
        """Determine if vehicle position should be processed."""
        if existing_vehicle_position is not None:
            context.logger.debug(
                f"Skipping duplicate vehicle position for vehicle_id={vehicle_id} at {timestamp} as it already exists."
            )
            context.telemetry.incr("vehicle_position_mapper.skipped_duplicate")
            return False
        return True

    def _get_trip_descriptor(self, vehicle):
        """Extract trip descriptor from vehicle if present."""
        return (
            trip_descriptor_to_model(vehicle.trip) if vehicle.HasField("trip") else None
        )

    async def _get_or_create_vehicle_document(self, vehicle) -> Vehicle | None:
        """Get existing vehicle document or create new one."""
        if not vehicle.HasField("vehicle"):
            return None

        existing_vehicle = await self._find_existing_vehicle(vehicle.vehicle.id)
        return existing_vehicle or vehicle_descriptor_to_model(
            vehicle.vehicle, self.agency_id
        )

    def _has_meaningful_position_change(
        self,
        context: Context,
        existing: VehiclePosition | None,
        new: VehiclePosition,
        vehicle_id: str,
        timestamp: datetime,
    ) -> bool:
        """Check if there's a meaningful change in position."""
        if existing and not self._has_position_change(existing, new):
            context.logger.debug(
                f"No meaningful change for vehicle position of vehicle_id={vehicle_id} at {timestamp}; skipping update."
            )
            context.telemetry.incr("vehicle_position_mapper.skipped_no_change")
            return False
        return True

    def _log_vehicle_position_processing(
        self,
        context: Context,
        vehicle_id: str,
        trip_instance_doc_id: str,
        timestamp: datetime,
    ):
        """Log vehicle position processing details."""
        context.logger.debug(
            f"Processing vehicle position for agency_id={self.agency_id} vehicle_id={vehicle_id} with trip_instance_id={trip_instance_doc_id} at {timestamp}"
        )

    def _create_update_function(
        self,
        vehicle_position: VehiclePosition,
        vehicle_doc: Vehicle | None,
        trip_instance: TripInstance | None,
    ) -> Callable[[], Awaitable[None]]:
        """Create the update function to be executed."""

        async def update_fn():
            await vehicle_position.save()
            if vehicle_doc:
                vehicle_doc.positions.append(vehicle_position)  # type: ignore
                await vehicle_doc.save()
            if trip_instance:
                trip_instance.vehicle = vehicle_doc  # type: ignore
                trip_instance.positions.append(vehicle_position)  # type: ignore
                await trip_instance.save()

        return update_fn

    def _has_position_change(
        self, existing: VehiclePosition, new: VehiclePosition
    ) -> bool:
        """Check if position has changed meaningfully."""
        excluded_fields = {"id", "ingested_at", "timestamp", "trip"}
        return existing.model_dump(exclude=excluded_fields) != new.model_dump(
            exclude=excluded_fields
        )

    async def _find_existing_trip_instance(
        self, trip_descriptor
    ) -> TripInstance | None:
        """Find existing trip instance matching the descriptor."""

        if not trip_descriptor:
            return None

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

    async def _find_existing_vehicle_position(
        self, vehicle_id: str, timestamp: datetime
    ) -> VehiclePosition | None:
        """Find existing vehicle position."""
        return await VehiclePosition.find_one(
            VehiclePosition.agency_id == self.agency_id,
            VehiclePosition.vehicle_id == vehicle_id,
            VehiclePosition.timestamp == timestamp,
        )

    async def _find_existing_vehicle(self, vehicle_id: str) -> Vehicle | None:
        """Find existing vehicle."""
        return await Vehicle.find_one(
            Vehicle.agency_id == self.agency_id,
            Vehicle.vehicle_id == vehicle_id,
        )
