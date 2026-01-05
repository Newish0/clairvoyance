import logging

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.postgres_upsert_sink import PostgresUpsertSink
from ingest_pipeline.sources.gtfs.stop_time_instance_source import (
    StopTimeInstanceSource,
)
from ingest_pipeline.transforms.gtfs.stop_time_instance_mapper import (
    StopTimeInstanceMapper,
)
from database.database_manager import DatabaseManager


def build_stop_time_instances_pipeline(
    agency_id,
    db: DatabaseManager,
    min_date="00000101",
    max_date="99991231",
    log_level=logging.INFO,
):
    stages = [
        StageSpec(
            "stop_time_instances_source",
            StopTimeInstanceSource(
                agency_id, min_date=min_date, max_date=max_date, db=db
            ),
        ),
        StageSpec("stop_time_instance_mapper", StopTimeInstanceMapper()),
        StageSpec(
            "postgres_upsert_sink", PostgresUpsertSink(db.createSession(), batch_size=1)
        ),
    ]
    return Orchestrator(
        stages, log_level=log_level, name="stop_time_instances_pipeline"
    )
