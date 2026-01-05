from typing import AsyncIterator, List, Tuple

from ingest_pipeline.core.types import Context, Transformer
from generated.db_models import (
    Agencies,
    CalendarDates,
    Trips,
    Routes,
    Shapes,
    StopTimes,
    TripInstances,
)
from utils.datetime import convert_to_datetime
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation


class TripInstanceMapper(
    Transformer[
        Tuple[
            Agencies,
            CalendarDates,
            Trips,
            StopTimes,
            Routes | None,
            Shapes | None,
        ],
        UpsertOperation,
    ]
):
    """
    Maps unique trip instances into postgres UpsertOperation
    """

    input_type: type[
        Tuple[
            Agencies,
            CalendarDates,
            Trips,
            StopTimes,
            Routes | None,
            Shapes | None,
        ]
    ] = Tuple[
        Agencies,
        CalendarDates,
        Trips,
        StopTimes,
        Routes | None,
        Shapes | None,
    ]
    output_type: type[UpsertOperation] = UpsertOperation

    def __init__(self):
        pass

    async def run(
        self,
        context: Context,
        inputs: AsyncIterator[
            Tuple[
                Agencies,
                CalendarDates,
                Trips,
                StopTimes,
                Routes | None,
                Shapes | None,
            ]
        ],
    ) -> AsyncIterator[UpsertOperation]:
        async for row in inputs:
            agency, calendar_date, trip, stop_time, route, shape = row
            try:
                state = "PRISTINE"
                if calendar_date.exception_type == "REMOVED":
                    state = "REMOVED"

                start_time = stop_time.arrival_time

                # Type ignore to bypass static type checking for required fields.
                # Pydantic validation will catch any issues at runtime.
                trip_instance = TripInstances(
                    agency_id=agency.id,
                    trip_id=trip.id,
                    route_id=route.id if route else None,  # type: ignore
                    shape_id=shape.id if shape else None,
                    start_date=calendar_date.date,
                    start_time=start_time,  # type: ignore
                    start_datetime=convert_to_datetime(
                        calendar_date.date,
                        start_time,
                        agency.timezone,
                        context.logger,
                    )
                    if start_time
                    else None,  # type: ignore
                    state=state,
                )

                # Only yield AFTER all validations pass
                yield UpsertOperation(
                    model=TripInstances,
                    values=trip_instance.model_dump(),
                    conflict_columns=["trip_id", "start_date", "start_time"],
                )

            except Exception as e:
                context.handle_error(e, "trip_instance_mapper.error")
