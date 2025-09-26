import logging

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink
from ingest_pipeline.sources.gtfs.trip_instance_source import TripInstanceSource
from ingest_pipeline.transforms.gtfs.trip_instance_mapper import TripInstanceMapper
from models.mongo_schemas import TripInstance


def build_trip_instances_pipeline(
    agency_id, min_date="00000101", max_date="99991231", log_level=logging.INFO
):
    stages = [
        StageSpec(
            "trip_instances_source",
            TripInstanceSource(agency_id, min_date=min_date, max_date=max_date),
        ),
        StageSpec("mapper", TripInstanceMapper(), parallelism=2),
        StageSpec("mongo", MongoUpsertSink(TripInstance)),
    ]
    return Orchestrator(stages, log_level=log_level)
