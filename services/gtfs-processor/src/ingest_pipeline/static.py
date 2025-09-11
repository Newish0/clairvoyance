import asyncio
import logging

from beanie import init_beanie

from ingest_pipeline.pipelines.gtfs.agency_pipeline import build_agency_pipeline
from ingest_pipeline.pipelines.gtfs.calendar_dates_pipeline import (
    build_calendar_dates_pipeline,
)
from ingest_pipeline.pipelines.gtfs.routes_pipeline import build_routes_pipeline
from ingest_pipeline.pipelines.gtfs.shapes_pipeline import build_shapes_pipeline
from ingest_pipeline.pipelines.gtfs.stop_times_pipeline import build_stop_times_pipeline
from ingest_pipeline.pipelines.gtfs.stops_pipeline import build_stops_pipeline
from ingest_pipeline.pipelines.gtfs.trip_instances_pipeline import (
    build_trip_instances_pipeline,
)
from ingest_pipeline.pipelines.gtfs.trips_pipeline import build_trips_pipeline
from ingest_pipeline.sources.gtfs.gtfs_archive import GTFSArchiveSource
from models.mongo_schemas import (
    Agency,
    CalendarDate,
    Route,
    Shape,
    Stop,
    StopTime,
    Trip,
    TripInstance,
)
from motor.motor_asyncio import AsyncIOMotorClient

from utils.logger_config import setup_logger


DOCUMENT_MODELS = [
    Agency,
    StopTime,
    CalendarDate,
    Route,
    Stop,
    Trip,
    Shape,
    TripInstance,
]


async def run_gtfs_static_pipelines(
    connection_string: str,
    database_name: str,
    agency_id: str,
    gtfs_url: str,
    drop_collections: bool = False,
    logger: logging.Logger = setup_logger("ingest_pipeline.static", logging.INFO),
):

    client = AsyncIOMotorClient(connection_string)

    if drop_collections:
        try:
            logger.info("Dropping existing collections...")
            for collection in DOCUMENT_MODELS:
                await client[database_name][collection.Settings.name].drop()
            logger.info("Existing collections dropped.")
        except Exception as e:
            logger.error(f"Failed to drop existing collections: {e}", exc_info=True)
            return

    await init_beanie(
        database=client.gtfs_data,
        document_models=DOCUMENT_MODELS,
    )

    async with GTFSArchiveSource(gtfs_url).materialize() as tmpdir:
        agency_pipeline = build_agency_pipeline(
            tmpdir / "agency.txt", agency_id, Agency
        )
        calendar_dates_pipeline = build_calendar_dates_pipeline(
            tmpdir / "calendar_dates.txt", agency_id, CalendarDate
        )
        routes_pipeline = build_routes_pipeline(tmpdir / "routes.txt", agency_id, Route)
        stops_pipeline = build_stops_pipeline(tmpdir / "stops.txt", agency_id, Stop)
        trips_pipeline = build_trips_pipeline(tmpdir / "trips.txt", agency_id, Trip)
        stop_times_pipeline = build_stop_times_pipeline(
            tmpdir / "stop_times.txt", agency_id, StopTime
        )
        shapes_pipeline = build_shapes_pipeline(tmpdir / "shapes.txt", agency_id, Shape)

        trip_instances_pipeline = build_trip_instances_pipeline(agency_id, TripInstance)

        await asyncio.gather(
            agency_pipeline.run(),
            stop_times_pipeline.run(),
            calendar_dates_pipeline.run(),
            routes_pipeline.run(),
            stops_pipeline.run(),
            trips_pipeline.run(),
            shapes_pipeline.run(),
        )

        # Must run after GTFS ingest from zip is complete.
        await trip_instances_pipeline.run()
