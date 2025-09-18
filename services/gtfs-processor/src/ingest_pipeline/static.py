import asyncio
import logging

from database.database_manager import DatabaseManager
from ingest_pipeline.pipelines.gtfs.agency_pipeline import build_agency_pipeline
from ingest_pipeline.pipelines.gtfs.calendar_dates_pipeline import (
    build_calendar_dates_pipeline,
)
from ingest_pipeline.pipelines.gtfs.feed_info_pipeline import build_feed_info_pipeline
from ingest_pipeline.pipelines.gtfs.routes_pipeline import build_routes_pipeline
from ingest_pipeline.pipelines.gtfs.shapes_pipeline import build_shapes_pipeline
from ingest_pipeline.pipelines.gtfs.stop_times_pipeline import build_stop_times_pipeline
from ingest_pipeline.pipelines.gtfs.stops_pipeline import build_stops_pipeline
from ingest_pipeline.pipelines.gtfs.trip_instances_pipeline import (
    build_trip_instances_pipeline,
)
from ingest_pipeline.pipelines.gtfs.trips_pipeline import build_trips_pipeline
from ingest_pipeline.sources.gtfs.gtfs_archive import GTFSArchiveSource
from utils.logger_config import setup_logger


async def run_gtfs_static_pipelines(
    connection_string: str,
    database_name: str,
    agency_id: str,
    gtfs_url: str,
    drop_collections: bool = False,
    logger: logging.Logger = setup_logger("ingest_pipeline.static", logging.INFO),
):

    db_manager = DatabaseManager(
        connection_string=connection_string,
        database_name=database_name,
        logger=logger,
    )

    await db_manager.connect()

    if drop_collections:
        await db_manager.drop_collections()

    async with GTFSArchiveSource(gtfs_url).materialize() as source_info:
        tmpdir = source_info.path

        agency_pipeline = build_agency_pipeline(tmpdir / "agency.txt", agency_id)
        feed_info_pipeline = build_feed_info_pipeline(
            tmpdir / "feed_info.txt", agency_id, source_info.hash
        )
        calendar_dates_pipeline = build_calendar_dates_pipeline(
            tmpdir / "calendar_dates.txt",
            agency_id,
        )
        routes_pipeline = build_routes_pipeline(
            tmpdir / "routes.txt",
            agency_id,
        )
        stops_pipeline = build_stops_pipeline(
            tmpdir / "stops.txt",
            agency_id,
        )
        trips_pipeline = build_trips_pipeline(
            tmpdir / "trips.txt",
            agency_id,
        )
        stop_times_pipeline = build_stop_times_pipeline(
            tmpdir / "stop_times.txt",
            agency_id,
        )
        shapes_pipeline = build_shapes_pipeline(
            tmpdir / "shapes.txt",
            agency_id,
        )

        trip_instances_pipeline = build_trip_instances_pipeline(
            agency_id,
        )

        await asyncio.gather(
            agency_pipeline.run(),
            feed_info_pipeline.run(),
            stop_times_pipeline.run(),
            calendar_dates_pipeline.run(),
            routes_pipeline.run(),
            stops_pipeline.run(),
            trips_pipeline.run(),
            shapes_pipeline.run(),
        )

        # Must run after GTFS ingest from zip is complete.
        await trip_instances_pipeline.run()
