from typing import AsyncIterator, Dict
from ingest_pipeline.core.errors import ErrorPolicy
from models.enums import CalendarExceptionType
from models.mongo_schemas import CalendarDate
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer
from beanie.odm.operators.update.general import Set


class CalendarDateMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS calendar_dates.txt rows (dict) into Mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: Mongo UpdateOne
    """

    __EXCEPTION_MAPPING = {
        "1": CalendarExceptionType.ADDED,
        "2": CalendarExceptionType.REMOVED,
    }

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            try:
                calendar_date_doc = CalendarDate(
                    agency_id=self.agency_id,
                    service_id=row.get("service_id"),
                    date=row.get("date"),
                    exception_type=self.__EXCEPTION_MAPPING.get(row.get("exception_type")),
                )

                yield UpdateOne(
                    {
                        "agency_id": self.agency_id,
                        "service_id": calendar_date_doc.service_id,
                        "date": calendar_date_doc.date,
                    },
                    {"$set": calendar_date_doc.model_dump(exclude={"id"})},
                    upsert=True,
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr(f"calendar_date_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
