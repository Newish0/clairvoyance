from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.route_mapper import RouteMapper
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink
from models.mongo_schemas import Route


def build_routes_pipeline(file_path, agency_id):
    stages = [
        StageSpec("files", LocalFileSource(file_path)),
        StageSpec("csv", CSVDecoder()),
        StageSpec("mapper", RouteMapper(agency_id)),
        StageSpec("mongo", MongoUpsertSink(Route)),
    ]
    return Orchestrator(stages)
