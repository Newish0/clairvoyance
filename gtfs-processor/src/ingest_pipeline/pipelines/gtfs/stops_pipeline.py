import logging

from sqlalchemy.ext.asyncio import AsyncSession

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.postgres_upsert_sink import PostgresUpsertSink
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.stop_mapper import StopMapper


def build_stops_pipeline(
    file_path,
    agency_id,
    session: AsyncSession,
    log_level=logging.INFO,
):
    stages = [
        StageSpec("file_source", LocalFileSource(file_path)),
        StageSpec("csv_decoder", CSVDecoder()),
        StageSpec("stop_mapper", StopMapper(agency_id, session)),
        StageSpec("postgres_upsert_sink", PostgresUpsertSink(session)),
    ]
    return Orchestrator(stages, log_level=log_level, name="stops_pipeline")
