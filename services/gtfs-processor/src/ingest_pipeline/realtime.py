import asyncio
import logging
from typing import Iterable, List

from database.database_manager import DatabaseManager
from ingest_pipeline.pipelines.gtfs.trip_updates_pipeline import (
    build_trip_updates_pipeline,
)
from ingest_pipeline.sources.gtfs.gtfs_protobuf import ProtobufSource
from utils.logger_config import setup_logger


async def run_gtfs_realtime_pipelines(
    connection_string: str,
    database_name: str,
    agency_id: str,
    gtfs_urls: Iterable[str],
    drop_collections: bool = False,
    logger: logging.Logger = setup_logger("ingest_pipeline.realtime", logging.INFO),
):

    db_manager = DatabaseManager(
        connection_string=connection_string,
        database_name=database_name,
        logger=logger,
    )

    await db_manager.connect()

    if drop_collections:
        await db_manager.drop_collections()

    for gtfs_url in gtfs_urls:
        async with ProtobufSource(gtfs_url).materialize() as source_info:
            data = source_info.data
            data_hash = source_info.hash

            trip_updates_pipeline = build_trip_updates_pipeline(data, agency_id)

            await asyncio.gather(
                trip_updates_pipeline.run(),
            )
