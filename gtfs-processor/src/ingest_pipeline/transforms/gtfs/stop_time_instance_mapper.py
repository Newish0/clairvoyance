from typing import AsyncIterator, Tuple
from datetime import datetime

from ingest_pipeline.core.types import Context, Transformer
from generated.db_models import (
    Agencies,
    StopTimes,
    TripInstances,
    StopTimeInstances,
)
from utils.datetime import convert_to_datetime
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation


class StopTimeInstanceMapper(
    Transformer[Tuple[Agencies, TripInstances, StopTimes], UpsertOperation]
):
    """
    Maps unique stop time instances into postgres UpsertOperation
    """

    input_type: type[Tuple[Agencies, TripInstances, StopTimes]] = Tuple[
        Agencies, TripInstances, StopTimes
    ]
    output_type: type[UpsertOperation] = UpsertOperation

    def __init__(self):
        pass

    async def run(
        self,
        context: Context,
        inputs: AsyncIterator[Tuple[Agencies, TripInstances, StopTimes]],
    ) -> AsyncIterator[UpsertOperation]:
        async for agency, trip_instance, stop_time in inputs:
            try:
                # TODO: Add pristine/dirty state to StopTimeInstance + handling

                # Type ignore to bypass static type checking for required fields.
                # Pydantic validation will catch any issues at runtime.
                stop_time_instance = StopTimeInstances(
                    trip_instance_id=trip_instance.id,
                    stop_time_id=stop_time.id,
                    timepoint=stop_time.timepoint or "EXACT",
                    stop_sequence=stop_time.stop_sequence,
                    scheduled_arrival_time=convert_to_datetime(
                        trip_instance.start_date,
                        stop_time.arrival_time,
                        agency.timezone,
                        context.logger,
                    )
                    if stop_time.arrival_time
                    else None,
                    scheduled_departure_time=convert_to_datetime(
                        trip_instance.start_date,
                        stop_time.departure_time,
                        agency.timezone,
                        context.logger,
                    )
                    if stop_time.departure_time
                    else None,
                    schedule_relationship="SCHEDULED",
                    stop_headsign=stop_time.stop_headsign,
                    pickup_type=stop_time.pickup_type,
                    drop_off_type=stop_time.drop_off_type,
                    last_updated_at=datetime.now(),
                )  # type: ignore - We know id can DNE.

                yield UpsertOperation(
                    model=StopTimeInstances,
                    values=stop_time_instance.model_dump(),
                    conflict_columns=[
                        "trip_instance_id",
                        "stop_sequence",
                    ],
                )
            except Exception as e:
                context.handle_error(e, "stop_time_instance_mapper.error")
