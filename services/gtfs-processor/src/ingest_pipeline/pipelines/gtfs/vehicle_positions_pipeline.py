import logging

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.async_fn_executor_sink import AsyncFunctionExecutorSink
from ingest_pipeline.sources.pass_through import PassThroughSource
from ingest_pipeline.transforms.gtfs.gtfs_realtime_protobuf_mapper import (
    GTFSRealtimeProtobufDecoder,
)
from ingest_pipeline.transforms.gtfs.realtime.vehicle_position_mapper import (
    VehiclePositionMapper,
)


def build_vehicle_positions_pipeline(protobuf, agency_id, log_level=logging.INFO):
    stages = [
        StageSpec("vehicle_position_source", PassThroughSource(protobuf, bytes)),
        StageSpec("protobuf", GTFSRealtimeProtobufDecoder()),
        StageSpec("mapper", VehiclePositionMapper(agency_id)),
        StageSpec("mongo_async_fn", AsyncFunctionExecutorSink()),
    ]
    return Orchestrator(stages, log_level=log_level)
