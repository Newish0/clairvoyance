from typing import AsyncIterator, Dict
from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.types import Context, Transformer
from generated.db_models import Agencies
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation


class AgencyMapper(Transformer[Dict[str, str], UpsertOperation]):
    """
    Maps GTFS agency.txt rows (dict) into a UpsertOperation to be sent to the database.
    Input: Dict[str, str]
    Output: UpsertOperation to upsert into database
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpsertOperation] = UpsertOperation

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpsertOperation]:
        async for row in inputs:
            try:
                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the model immediately after.
                agency_model = Agencies(
                    id=self.agency_id,
                    agency_sid=row.get("agency_id"),  # type: ignore
                    name=row.get("agency_name"),  # type: ignore
                    url=row.get("agency_url"),  # type: ignore
                    timezone=row.get("agency_timezone"),  # type: ignore
                    lang=row.get("agency_lang"),
                    phone=row.get("agency_phone"),
                    fare_url=row.get("agency_fare_url"),
                    email=row.get("agency_email"),
                )

                yield UpsertOperation(
                    model=Agencies,
                    values=agency_model.model_dump(),
                    conflict_columns=["id"],
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("agency_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
