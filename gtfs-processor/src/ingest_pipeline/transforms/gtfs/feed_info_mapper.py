from typing import AsyncIterator, Dict

from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation
from generated.db_models import FeedInfo


class FeedInfoMapper(Transformer[Dict[str, str], UpsertOperation]):
    """
    Maps GTFS feed_info.txt rows (dict) into an UpsertOperation for the relational
    `FeedInfo` SQLModel table.

    Input: Dict[str, str]
    Output: UpsertOperation
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpsertOperation] = UpsertOperation

    def __init__(self, agency_id: str, feed_hash: str):
        self.agency_id = agency_id
        self.feed_hash = feed_hash

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpsertOperation]:
        async for row in inputs:
            try:
                # Map GTFS feed_info.txt fields into the FeedInfo SQLModel
                feed_info_model = FeedInfo(
                    hash=self.feed_hash,
                    agency_id=self.agency_id,
                    publisher_name=row.get("feed_publisher_name"),
                    publisher_url=row.get("feed_publisher_url"),
                    lang=row.get("feed_lang"),
                    version=row.get("feed_version"),
                    start_date=row.get("feed_start_date"),
                    end_date=row.get("feed_end_date"),
                )

                yield UpsertOperation(
                    model=FeedInfo,
                    values=feed_info_model.model_dump(),
                    conflict_columns=["hash"],
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
