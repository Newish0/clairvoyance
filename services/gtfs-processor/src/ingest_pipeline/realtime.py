import asyncio
import logging
import signal
from typing import Iterable

from database.database_manager import DatabaseManager
from ingest_pipeline.pipelines.gtfs.alerts_pipeline import build_alerts_pipeline
from ingest_pipeline.pipelines.gtfs.trip_updates_pipeline import (
    build_trip_updates_pipeline,
)
from ingest_pipeline.pipelines.gtfs.vehicle_positions_pipeline import (
    build_vehicle_positions_pipeline,
)
from ingest_pipeline.sources.gtfs.gtfs_protobuf import ProtobufSource
from utils.logger_config import setup_logger


async def run_gtfs_realtime_pipelines(
    connection_string: str,
    database_name: str,
    agency_id: str,
    gtfs_urls: Iterable[str],
    drop_collections: bool = False,
    poll=0,
    log_level: int = logging.INFO,
):
    logger = setup_logger("ingest_pipeline.realtime", log_level)

    shutdown_event = asyncio.Event()

    def signal_handler(signum, frame):
        logger.info("Received interrupt signal, shutting down gracefully...")
        shutdown_event.set()

    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    db_manager = DatabaseManager(
        connection_string=connection_string,
        database_name=database_name,
        logger=logger,
    )

    try:
        await db_manager.connect()

        if drop_collections:
            await db_manager.drop_collections()

        last_data_hash = None
        while not shutdown_event.is_set():
            for gtfs_url in gtfs_urls:
                if shutdown_event.is_set():
                    break

                try:
                    async with ProtobufSource(gtfs_url).materialize() as source_info:
                        data = source_info.data
                        data_hash = source_info.hash

                        # Skip if there's no change to data.
                        if last_data_hash == data_hash:
                            continue
                        last_data_hash = data_hash

                        trip_updates_pipeline = build_trip_updates_pipeline(
                            data, agency_id, log_level=log_level
                        )
                        vehicle_positions_pipeline = build_vehicle_positions_pipeline(
                            data, agency_id, log_level=log_level
                        )
                        alerts_pipeline = build_alerts_pipeline(
                            data, agency_id, log_level=log_level
                        )

                        await asyncio.gather(
                            trip_updates_pipeline.run(),
                            vehicle_positions_pipeline.run(),
                            alerts_pipeline.run(),
                        )
                except Exception as e:
                    logger.error(f"Error processing {gtfs_url}: {e}", exc_info=True)
                    continue

            if poll <= 0 or shutdown_event.is_set():
                break

            logger.info("Sleeping for %s seconds until next poll...", poll)

            # Use wait_for to allow interruption during sleep
            try:
                await asyncio.wait_for(shutdown_event.wait(), timeout=poll)
            except asyncio.TimeoutError:
                # Normal timeout, continue to next iteration
                pass

        logger.info("Shutdown complete")

    except Exception as e:
        logger.error(f"Fatal error in pipeline: {e}", exc_info=True)
        raise
    finally:
        # Clean up database connection
        if db_manager:
            await db_manager.close()
            logger.info("Database connection closed")
