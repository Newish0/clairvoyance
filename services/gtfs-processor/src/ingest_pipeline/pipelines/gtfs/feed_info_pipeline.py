from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.feed_info_mapper import FeedInfoMapper
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink


def build_feed_info_pipeline(file_path, agency_id, feed_hash, document):
    stages = [
        StageSpec("files", LocalFileSource(file_path)),
        StageSpec("csv", CSVDecoder()),
        StageSpec("mapper", FeedInfoMapper(agency_id, feed_hash)),
        StageSpec("mongo", MongoUpsertSink(document)),
    ]
    return Orchestrator(stages)
