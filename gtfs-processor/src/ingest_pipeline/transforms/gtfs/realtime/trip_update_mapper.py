from typing import AsyncIterator
from datetime import datetime, timezone

from pymongo import UpdateOne
from bson import DBRef

from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.transforms.gtfs.gtfs_realtime_protobuf_mapper import ParsedEntity
from ingest_pipeline.transforms.gtfs.realtime.proto_to_model import (
    trip_descriptor_to_model,
    stop_time_update_to_model,
    TripDescriptorScheduleRelationship,
)

from models.mongo_schemas import (
    Agency,
    StopTimeInstance,
    TripInstance,
    TripInstanceState,
    Trip,
    Route,
)
from beanie.operators import Or, And


class TripUpdateMapper(Transformer[ParsedEntity, UpdateOne]):
    """Maps GTFS-RT trip update entities to MongoDB update operations."""

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
                "trip_update_mapper.error.agency_not_found",
            )
            return

        async for parsed_entity in inputs:
            if not self._has_trip_update_message(parsed_entity.entity):
                continue

            try:
                update_one = await self._process_trip_update(
                    context, parsed_entity, agency
                )

                # Skip if update_one is None (indicates a skip due to already handled errors).
                if update_one:
                    yield update_one
            except Exception as e:
                context.handle_error(e, "trip_update_mapper.error.processing_failed")

    async def _get_agency(self, context: Context) -> Agency | None:
        """Get agency by ID with error handling."""
        agency = await Agency.find_one(Agency.agency_id == self.agency_id)
        return agency

    def _has_trip_update_message(self, entity) -> bool:
        """Check if entity has a trip update."""
        return entity.HasField("trip_update")

    async def _process_trip_update(
        self, context: Context, parsed_entity: ParsedEntity, agency: Agency
    ) -> UpdateOne | None:
        """
        Process a single trip update entity.

        Returns:
        A MongoDB update operation or None to indicate a skip (e.g., due to errors)
        """
        entity = parsed_entity.entity
        trip_update = entity.trip_update

        if not self._has_required_trip_fields(trip_update):
            context.handle_error(
                Exception("Missing required trip fields"),
                "trip_update_mapper.error.missing_fields",
            )
            return None

        trip_descriptor = trip_descriptor_to_model(trip_update.trip)
        trip_instance = await self._find_existing_trip_instance(trip_descriptor)

        if not self._should_process_trip_update(
            context, trip_instance, trip_descriptor
        ):
            return None

        stop_times = self._process_stop_time_updates(trip_update, agency, trip_instance)

        self._log_trip_update_processing(context, trip_descriptor)

        if trip_instance is None:
            update_one = await self._create_new_trip_instance_update(
                context, trip_descriptor, stop_times
            )
            if update_one:
                return update_one
        else:
            return self._create_existing_trip_instance_update(
                context, trip_descriptor, trip_instance, stop_times
            )

        return None

    async def _find_existing_trip_instance(
        self, trip_descriptor
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

    def _should_process_trip_update(
        self, context: Context, trip_instance: TripInstance | None, trip_descriptor
    ) -> bool:
        """Determine if trip update should be processed."""
        if (
            not trip_instance
            and trip_descriptor.schedule_relationship
            != TripDescriptorScheduleRelationship.NEW
        ):
            context.handle_error(
                Exception(
                    f"TripInstance not found for non-new trip update while looking for {trip_descriptor}"
                ),
                "trip_update_mapper.error.trip_instance_not_found",
            )
            return False
        return True

    def _process_stop_time_updates(
        self, trip_update, agency: Agency, trip_instance: TripInstance | None
    ) -> list[StopTimeInstance]:
        """Process all stop time updates and return sorted list."""
        # stop_times_with_seq: list[tuple[int | None, StopTimeInstance]] = []
        # for stu in trip_update.stop_time_update:
        #     seq, existing_sti = None, None
        #     if trip_instance is not None:
        #         seq, existing_sti = self._find_existing_stop_time(stu, trip_instance)
        #     stop_time = stop_time_update_to_model(stu, existing_sti, seq)
        #     stop_times_with_seq.append(stop_time)
        existing_stop_times = (
            trip_instance.stop_times if trip_instance is not None else []
        )
        new_stop_times_with_seq: list[tuple[int | None, StopTimeInstance]] = []
        for stu in trip_update.stop_time_update:
            updated = False
            for index, existing_stop_time in enumerate(existing_stop_times):
                seq = index + 1
                if existing_stop_time.stop_id == stu.stop_id:
                    updated_seq, updated_stop_time = stop_time_update_to_model(
                        stu, existing_stop_time
                    )
                    if updated_seq is None or updated_seq == seq:
                        existing_stop_times[index] = updated_stop_time
                        updated = True
                        break
                    else:
                        raise Exception(
                            f"Stop time sequence mismatch: {updated_seq} != {seq}"
                        )
            if not updated:
                new_seq, new_stop_time = stop_time_update_to_model(stu, None)
                new_stop_times_with_seq.append((new_seq, new_stop_time))

        existing_stop_times_with_seq = [
            (index + 1, existing_stop_time)
            for index, existing_stop_time in enumerate(existing_stop_times)
        ]
        merged_stop_times_with_seq = (
            existing_stop_times_with_seq + new_stop_times_with_seq
        )

        # Sort by stop sequence, putting None values at the end
        merged_stop_times_with_seq.sort(
            key=lambda x: x[0] if x[0] is not None else float("inf")
        )

        stop_times = [sti for _, sti in merged_stop_times_with_seq]
        return stop_times

    # def _find_existing_stop_time(self, stu, trip_instance: TripInstance):
    #     """Find existing stop time for the given stop time update with index."""
    #     for seq, stop_time in enumerate(trip_instance.stop_times):
    #         if stop_time.stop_id == stu.stop_id:
    #             return seq, stop_time
    #     return None, None

    def _log_trip_update_processing(self, context: Context, trip_descriptor):
        """Log trip update processing details."""
        context.logger.debug(
            f"Processed Trip Update for agency: {self.agency_id}, "
            f"trip_id: {trip_descriptor.trip_id}, "
            f"start_date: {trip_descriptor.start_date}, "
            f"start_time: {trip_descriptor.start_time}"
        )

    async def _create_new_trip_instance_update(
        self,
        context: Context,
        trip_descriptor,
        stop_times: list[StopTimeInstance],
    ) -> UpdateOne | None:
        """Create update operation for new trip instance."""
        trip, route = await self._get_trip_and_route(context, trip_descriptor)
        if not trip or not route:
            return None  # Error already handled in _get_trip_and_route; return None to indicate a skip

        state = TripInstanceState.DIRTY
        if (
            trip_descriptor.schedule_relationship
            == TripDescriptorScheduleRelationship.CANCELED
        ):
            state = TripInstanceState.REMOVED

        trip_instance = TripInstance(
            agency_id=self.agency_id,
            trip_id=trip_descriptor.trip_id,  # type: ignore
            start_date=trip_descriptor.start_date,  # type: ignore
            start_time=trip_descriptor.start_time,  # type: ignore
            route_id=route.route_id,
            direction_id=trip.direction_id,
            state=state,
            start_datetime=stop_times[0].arrival_datetime
            or stop_times[0].departure_datetime,  # type: ignore
            stop_times=stop_times,
            stop_times_updated_at=datetime.now(timezone.utc),
            route=route,  # type: ignore
            trip=trip,  # type: ignore
        )

        await trip_instance.validate_self()

        context.logger.debug(
            f"Creating new TripInstance for agency_id: {self.agency_id}, "
            f"trip_id: {trip_descriptor.trip_id}, "
            f"start_date: {trip_descriptor.start_date}, "
            f"start_time: {trip_descriptor.start_time}"
        )

        # TODO: May need to handle shape assignment (link) once shapes are in RT data.

        return UpdateOne(
            self._build_trip_filter(trip_descriptor),
            {
                "$set": {
                    **trip_instance.model_dump(
                        exclude={"id", "route", "trip", "shape"}
                    ),
                    "trip": DBRef(collection=Trip.Settings.name, id=trip.id),
                    "route": DBRef(collection=Route.Settings.name, id=route.id),
                }
            },
            upsert=True,
        )

    def _create_existing_trip_instance_update(
        self,
        context: Context,
        trip_descriptor,
        trip_instance: TripInstance,
        stop_times: list[StopTimeInstance],
    ) -> UpdateOne:
        """Create update operation for existing trip instance."""
        new_state = TripInstanceState.DIRTY
        if (
            trip_descriptor.schedule_relationship
            == TripDescriptorScheduleRelationship.CANCELED
        ):
            new_state = TripInstanceState.REMOVED

        trip_instance.state = new_state
        trip_instance.stop_times = stop_times
        trip_instance.stop_times_updated_at = datetime.now(timezone.utc)

        context.logger.debug(
            f"Creating update to TripInstance for agency_id: {self.agency_id}, "
            f"trip_id: {trip_descriptor.trip_id}, "
            f"start_date: {trip_descriptor.start_date}, "
            f"start_time: {trip_descriptor.start_time}"
        )

        return UpdateOne(
            self._build_trip_filter(trip_descriptor),
            {
                "$set": trip_instance.model_dump(
                    exclude={"id", "route", "trip", "shape", "positions", "vehicle"}
                )
            },
        )

    async def _get_trip_and_route(
        self, context: Context, trip_descriptor
    ) -> tuple[Trip | None, Route | None]:
        """Get trip and route objects for the trip descriptor with error handling."""
        trip = await Trip.find_one(
            Trip.trip_id == trip_descriptor.trip_id, Trip.agency_id == self.agency_id
        )

        route = await Route.find_one(
            Route.agency_id == self.agency_id,
            Route.route_id == trip_descriptor.route_id,
        )

        if not trip:
            context.handle_error(
                Exception(
                    f"Trip {trip_descriptor.trip_id} not found for agency {self.agency_id}"
                ),
                "trip_update_mapper.error.trip_not_found",
            )

        if not route:
            context.handle_error(
                Exception(
                    f"Route {trip_descriptor.route_id} not found for agency {self.agency_id}"
                ),
                "trip_update_mapper.error.route_not_found",
            )

        return trip, route

    def _build_trip_filter(self, trip_descriptor) -> dict:
        """Build MongoDB filter for trip instance."""
        return {
            "agency_id": self.agency_id,
            "trip_id": trip_descriptor.trip_id,
            "start_date": trip_descriptor.start_date,
            "start_time": trip_descriptor.start_time,
        }

    def _has_required_trip_fields(self, trip_update) -> bool:
        """Check if trip update has all required fields."""
        return (
            trip_update.HasField("trip")
            and trip_update.trip.HasField("trip_id")
            and trip_update.trip.HasField("start_date")
            and trip_update.trip.HasField("start_time")
        )
