from typing import AsyncIterator, Dict
from ingest_pipeline.core.errors import ErrorPolicy
from models.mongo_schemas import FeedInfo
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer


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
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in inputs:
            try:
                feed_info_doc = FeedInfo(
                    agency_id=self.agency_id,
                    feed_hash=self.feed_hash,
                    feed_publisher_name=row.get("feed_publisher_name"),
                    feed_publisher_url=row.get("feed_publisher_url"),
                    feed_lang=row.get("feed_lang"),
                    feed_version=row.get("feed_version"),
                    feed_start_date=row.get("feed_start_date"),
                    feed_end_date=row.get("feed_end_date"),
                )

                await feed_info_doc.validate_self()

                yield UpdateOne(
                    {"agency_id": self.agency_id, "feed_hash": self.feed_hash},
                    {"$set": feed_info_doc.model_dump(exclude={"id"})},
                    upsert=True,
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("feed_info_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
