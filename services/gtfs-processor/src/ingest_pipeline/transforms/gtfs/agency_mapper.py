from types import CoroutineType
from typing import Any, AsyncIterator, Dict
from models.mongo_schemas import Agency
from pymongo.results import UpdateResult
from ingest_pipeline.core.types import Transformer
from beanie.odm.operators.update.general import Set


class AgencyMapper(Transformer[Dict[str, str], CoroutineType[Any, Any, UpdateResult]]):
    """
    Maps GTFS agency.txt rows (dict) into Motor CoroutineType[Any, Any, UpdateResult] operations after validation through DB model.
    Input: Dict[str, str]
    Output: Motor CoroutineType[Any, Any, UpdateResult]
    """

    def __init__(self, agency_id: str):
        self.agency_id = agency_id
        
        # alias
        self.run = self.transform

    async def transform(
        self, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[CoroutineType[Any, Any, UpdateResult]]:
        async for row in items:
            agency_doc = Agency(
                agency_id=self.agency_id,
                source_agency_id=row["agency_id"],
                agency_name=row["agency_name"],
                agency_url=row["agency_url"],
                agency_timezone=row["agency_timezone"],
                agency_lang=row["agency_lang"],
                agency_phone=row["agency_phone"],
                agency_fare_url=row["agency_fare_url"],
                agency_email=row["agency_email"],
            )
            

            update_operation = Agency.get_motor_collection().update_one(
                {"agency_id": self.agency_id},
                {"$set": agency_doc.model_dump()},
                upsert=True,
            )

            yield update_operation
