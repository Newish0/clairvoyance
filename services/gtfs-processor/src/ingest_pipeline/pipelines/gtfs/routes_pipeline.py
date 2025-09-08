from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.route_mapper import RouteMapper
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink


def build_routes_pipeline(file_path, agency_id, route_document):
    stages = [
        StageSpec("files", LocalFileSource(file_path)),
        StageSpec("csv", CSVDecoder()),
        StageSpec("mapper", RouteMapper(agency_id)),
        StageSpec("mongo", MongoUpsertSink(route_document)),
    ]
    return Orchestrator(stages)
