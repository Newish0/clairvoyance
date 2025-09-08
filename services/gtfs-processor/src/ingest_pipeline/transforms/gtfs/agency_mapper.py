from typing import Any, AsyncIterator, Dict
from models.mongo_schemas import Agency
from pymongo import UpdateOne
from ingest_pipeline.core.types import Transformer
from beanie.odm.operators.update.general import Set


class AgencyMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS agency.txt rows (dict) into mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: mongo UpdateOne
    """

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            agency_doc = Agency(
                agency_id=self.agency_id,
                source_agency_id=row.get("agency_id"),
                agency_name=row.get("agency_name"),
                agency_url=row.get("agency_url"),
                agency_timezone=row.get("agency_timezone"),
                agency_lang=row.get("agency_lang"),
                agency_phone=row.get("agency_phone"),
                agency_fare_url=row.get("agency_fare_url"),
                agency_email=row.get("agency_email"),
            )

            yield UpdateOne(
                {
                    "agency_id": self.agency_id,
                    "source_agency_id": agency_doc.source_agency_id,
                },
                {"$set": agency_doc.model_dump(exclude={"id"})},
                upsert=True,
            )
