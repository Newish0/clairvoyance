from typing import AsyncIterator, Dict
from ingest_pipeline.core.errors import ErrorPolicy
from models.mongo_schemas import Agency
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer


class AgencyMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS agency.txt rows (dict) into mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: mongo UpdateOne
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpdateOne] = UpdateOne

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in inputs:
            try:
                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the model immediately after.
                agency_doc = Agency(
                    agency_id=self.agency_id,
                    source_agency_id=row.get("agency_id"),  # type: ignore
                    agency_name=row.get("agency_name"),  # type: ignore
                    agency_url=row.get("agency_url"),  # type: ignore
                    agency_timezone=row.get("agency_timezone"),  # type: ignore
                    agency_lang=row.get("agency_lang"),
                    agency_phone=row.get("agency_phone"),
                    agency_fare_url=row.get("agency_fare_url"),
                    agency_email=row.get("agency_email"),
                )

                await agency_doc.validate_self()

                yield UpdateOne(
                    {
                        "agency_id": self.agency_id,
                        "source_agency_id": agency_doc.source_agency_id,
                    },
                    {"$set": agency_doc.model_dump(exclude={"id"})},
                    upsert=True,
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
