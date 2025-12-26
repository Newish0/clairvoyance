from typing import AsyncIterator, Dict

from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation
from generated.db_models import CalendarDates


class CalendarDateMapper(Transformer[Dict[str, str], UpsertOperation]):
    """
    Maps GTFS calendar_dates.txt rows (dict) into UpsertOperations for the
    relational `CalendarDates` table.

    Input: Dict[str, str]
    Output: UpsertOperation
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpsertOperation] = UpsertOperation

    __EXCEPTION_MAPPING = {
        "1": "ADDED",
        "2": "REMOVED",
        None: None,
    }

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpsertOperation]:
        async for row in inputs:
            try:
                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the model immediately after.
                calendar_date_model = CalendarDates(
                    agency_id=self.agency_id,
                    service_sid=row.get("service_id"),  # type: ignore
                    date=row.get("date"),  # type: ignore
                    exception_type=self.__EXCEPTION_MAPPING.get(
                        row.get("exception_type")
                    ),  # type: ignore
                )

                yield UpsertOperation(
                    model=CalendarDates,
                    values=calendar_date_model.model_dump(),
                    conflict_columns=["agency_id", "service_sid", "date"],
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("calendar_date_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
