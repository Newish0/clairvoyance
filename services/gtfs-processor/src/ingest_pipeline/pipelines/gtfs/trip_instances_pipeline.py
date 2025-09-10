from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sources.gtfs.trip_instance_source import TripInstanceSource
from ingest_pipeline.transforms.gtfs.trip_instance_mapper import TripInstanceMapper
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink


def build_trip_instances_pipeline(agency_id, document):
    stages = [
        StageSpec("trip_instances_source", TripInstanceSource(agency_id)),
        StageSpec("mapper", TripInstanceMapper()),
        StageSpec("mongo", MongoUpsertSink(document)),
    ]
    return Orchestrator(stages)
