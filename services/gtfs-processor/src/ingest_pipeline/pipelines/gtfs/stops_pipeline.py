import logging

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.stop_mapper import StopMapper
from models.mongo_schemas import Stop


def build_stops_pipeline(
    file_path,
    agency_id,
    log_level=logging.INFO,
):
    stages = [
        StageSpec("file_source", LocalFileSource(file_path)),
        StageSpec("csv_decoder", CSVDecoder()),
        StageSpec("stop_mapper", StopMapper(agency_id)),
        StageSpec("mongo_sink", MongoUpsertSink(Stop)),
    ]
    return Orchestrator(stages, log_level=log_level, name="stops_pipeline")
