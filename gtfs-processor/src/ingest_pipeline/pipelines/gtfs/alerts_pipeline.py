import logging

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink
from ingest_pipeline.sources.pass_through import PassThroughSource
from ingest_pipeline.transforms.gtfs.gtfs_realtime_protobuf_mapper import (
    GTFSRealtimeProtobufDecoder,
)
from ingest_pipeline.transforms.gtfs.realtime.alert_mapper import AlertMapper
from models.mongo_schemas import Alert


def build_alerts_pipeline(protobuf, agency_id, log_level=logging.INFO):
    stages = [
        StageSpec("alert_source", PassThroughSource(protobuf, bytes)),
        StageSpec("protobuf_decoder", GTFSRealtimeProtobufDecoder()),
        StageSpec("alert_mapper", AlertMapper(agency_id)),
        StageSpec("mongo_upsert_sink", MongoUpsertSink(Alert)),
    ]
    return Orchestrator(stages, log_level=log_level, name="alerts_pipeline")
