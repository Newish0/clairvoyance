from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.shape_mapper import ShapeMapper
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink
from lib.gtfs_realtime_pb2 import Shape


def build_shapes_pipeline(
    file_path,
    agency_id,
):
    stages = [
        StageSpec("files", LocalFileSource(file_path)),
        StageSpec("csv", CSVDecoder()),
        StageSpec("mapper", ShapeMapper(agency_id)),
        StageSpec("mongo", MongoUpsertSink(Shape)),
    ]
    return Orchestrator(stages)
