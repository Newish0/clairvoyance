from typing import AsyncIterator, Dict
from models.mongo_schemas import FeedInfo
from pymongo import UpdateOne
from ingest_pipeline.core.types import Transformer
from beanie.odm.operators.update.general import Set


class FeedInfoMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS feed_info.txt rows (dict) into Mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: Mongo UpdateOne
    """

    def __init__(self, agency_id: str, feed_hash: str):
        self.agency_id = agency_id
        self.feed_hash = feed_hash

    async def run(
        self, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            feed_info_doc = FeedInfo(
                agency_id=self.agency_id,
                feed_hash=self.feed_hash,
                feed_publisher_name=row.get("publisher_name"),
                feed_publisher_url=row.get("publisher_url"),
                feed_lang=row.get("lang"),
                feed_version=row.get("version"),
                feed_start_date=row.get("start_date"),
                feed_end_date=row.get("end_date"),
            )

            yield UpdateOne(
                {"agency_id": self.agency_id, "feed_hash": self.feed_hash},
                {"$set": feed_info_doc.model_dump(exclude={"id"})},
                upsert=True,
            )
