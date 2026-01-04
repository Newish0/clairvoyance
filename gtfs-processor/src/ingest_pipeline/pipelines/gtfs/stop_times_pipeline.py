import logging

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.postgres_upsert_sink import PostgresUpsertSink
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.stop_time_mapper import StopTimeMapper
from database.database_manager import DatabaseManager


def build_stop_times_pipeline(
    file_path,
    agency_id,
    db: DatabaseManager,
    log_level=logging.INFO,
):
    stages = [
        StageSpec("file_source", LocalFileSource(file_path)),
        StageSpec("csv_decoder", CSVDecoder()),
        StageSpec("stop_time_mapper", StopTimeMapper(agency_id, db)),
        StageSpec("postgres_upsert_sink", PostgresUpsertSink(db.createSession())),
    ]
    return Orchestrator(stages, log_level=log_level, name="stop_times_pipeline")
