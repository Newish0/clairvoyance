from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.calendar_date_mapper import CalendarDateMapper
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink


def build_calendar_dates_pipeline(file_path, agency_id, document):
    stages = [
        StageSpec("files", LocalFileSource(file_path)),
        StageSpec("csv", CSVDecoder()),
        StageSpec("mapper", CalendarDateMapper(agency_id)),
        StageSpec("mongo", MongoUpsertSink(document)),
    ]
    return Orchestrator(stages)
