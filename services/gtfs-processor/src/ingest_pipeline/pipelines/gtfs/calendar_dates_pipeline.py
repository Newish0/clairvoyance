import logging
from math import log

from ingest_pipeline.core.orchestrator import Orchestrator
from ingest_pipeline.core.types import StageSpec
from ingest_pipeline.sinks.mongo_upsert_sink import MongoUpsertSink
from ingest_pipeline.sources.local_file import LocalFileSource
from ingest_pipeline.transforms.csv_decoder import CSVDecoder
from ingest_pipeline.transforms.gtfs.calendar_date_mapper import CalendarDateMapper
from models.mongo_schemas import CalendarDate


def build_calendar_dates_pipeline(
    file_path,
    agency_id,
    log_level=logging.INFO,
):
    stages = [
        StageSpec("file_source", LocalFileSource(file_path)),
        StageSpec("csv_decoder", CSVDecoder()),
        StageSpec("calendar_date_mapper", CalendarDateMapper(agency_id)),
        StageSpec("mongo_sink", MongoUpsertSink(CalendarDate)),
    ]
    return Orchestrator(stages, log_level=log_level, name="calendar_dates_pipeline")
