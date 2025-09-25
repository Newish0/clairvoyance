import logging

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink
from ingest_pipeline.sources.pass_through import PassThroughSource
from ingest_pipeline.transforms.gtfs.gtfs_realtime_protobuf_mapper import (
    GTFSRealtimeProtobufDecoder,
)
from ingest_pipeline.transforms.gtfs.realtime.trip_update_mapper import TripUpdateMapper
from models.mongo_schemas import TripInstance


def build_trip_updates_pipeline(protobuf, agency_id, log_level=logging.INFO):
    stages = [
        StageSpec("trip_update_source", PassThroughSource(protobuf, bytes)),
        StageSpec("protobuf", GTFSRealtimeProtobufDecoder()),
        StageSpec("mapper", TripUpdateMapper(agency_id)),
        StageSpec("mongo", MongoUpsertSink(TripInstance)),
    ]
    return Orchestrator(stages, log_level=log_level)
