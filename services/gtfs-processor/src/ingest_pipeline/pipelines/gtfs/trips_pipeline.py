from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.trip_mapper import TripMapper
from ingest_pipeline.sinks.mongo_sink import MongoSink


def build_trips_pipeline(file_path, agency_id, mongo_coll):
    stages = [
        StageSpec("files", LocalFileSource(file_path)),
        StageSpec("csv", CSVDecoder()),
        StageSpec("mapper", TripMapper(agency_id)),
        StageSpec("mongo", MongoSink(mongo_coll)),
    ]
    return Orchestrator(stages)
