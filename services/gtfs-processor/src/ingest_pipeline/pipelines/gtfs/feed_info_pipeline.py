import logging

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.feed_info_mapper import FeedInfoMapper
from models.mongo_schemas import FeedInfo


def build_feed_info_pipeline(
    file_path,
    agency_id,
    feed_hash,
    log_level=logging.INFO,
):
    stages = [
        StageSpec("file_source", LocalFileSource(file_path)),
        StageSpec("csv_decoder", CSVDecoder()),
        StageSpec("feed_info_mapper", FeedInfoMapper(agency_id, feed_hash)),
        StageSpec("mongo_sink", MongoUpsertSink(FeedInfo)),
    ]
    return Orchestrator(stages, log_level=log_level, name="feed_info_pipeline")
