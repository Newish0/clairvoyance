import logging

from database.database_manager import DatabaseManager
from ingest_pipeline.pipelines.gtfs.trip_instances_pipeline import (
    build_trip_instances_pipeline,
)
from utils.logger_config import setup_logger


async def run_realize_instances_pipelines(
    connection_string: str,
    database_name: str,
    agency_id: str,
    min_date: str,
    max_date: str,
    drop_collections: bool = False,
    log_level: int = logging.INFO,
):
    logger = setup_logger("ingest_pipeline.realize_instances", log_level)

    db_manager = DatabaseManager(
        connection_string=connection_string,
        database_name=database_name,
        logger=logger,
    )

    await db_manager.connect()

    if drop_collections:
        await db_manager.drop_collections()

    trip_instances_pipeline = build_trip_instances_pipeline(
        agency_id, min_date, max_date, log_level=log_level
    )

    # Must run after GTFS ingest from zip is complete.
    await trip_instances_pipeline.run()
