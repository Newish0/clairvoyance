from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.stop_time_mapper import StopTimeMapper
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink
from models.mongo_schemas import StopTime
import logging


def build_stop_times_pipeline(
    file_path,
    agency_id,
    log_level=logging.INFO,
):
    stages = [
        StageSpec("files", LocalFileSource(file_path)),
        StageSpec("csv", CSVDecoder()),
        StageSpec("mapper", StopTimeMapper(agency_id)),
        StageSpec("mongo", MongoUpsertSink(StopTime)),
    ]
    return Orchestrator(stages, log_level=log_level)
