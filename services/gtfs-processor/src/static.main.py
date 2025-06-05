import argparse
import asyncio
import logging
import sys
import os
from typing import Iterable, Iterator, List, Type
from beanie import Document, init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from parsing.gtfs_reader import GTFSReader, ParsedGTFSData
from models import (
    Route,
    ScheduledTripDocument,
    Shape,
    Stop
)
from config import setup_logger


# --- Configuration ---
MONGO_CONNECTION_STRING = (
    os.getenv("MONGO_CONNECTION_STRING") or "mongodb://localhost:27017"
)
DATABASE_NAME = os.getenv("MONGO_DB_NAME") or "gtfs_data"
GTFS_ZIP_FILE = "bctransit_gtfs.zip"

INSERT_BATCH_SIZE = 500  # Batch size for all insert_many operations

DOCUMENT_MODELS: List[Type[Document]] = [
    Stop,
    Route,
    Shape,
    ScheduledTripDocument,
]

# --- Setup Logger ---
logger = None


# --- Helper Functions for Processing and Insertion ---
async def _batch_insert(
    collection: Type[Document],  # Beanie Document class (e.g., Stop, Route)
    items: Iterable[Document],
    batch_size: int = INSERT_BATCH_SIZE,
):
    """Helper to insert documents in batches."""
    total_count = 0
    num_batches = 0
    batch = []
    for item in items:
        batch.append(item)
        if len(batch) == batch_size:
            num_batches += 1
            await collection.insert_many(batch)
            total_count += len(batch)
            batch = []
    if batch:
        num_batches += 1
        await collection.insert_many(batch)
        total_count += len(batch)

    logger.info(
        f"Inserted {total_count} {collection.__name__} documents in {num_batches} batches of {batch_size}."
    )


async def process_and_insert_stops(parsed_gtfs: ParsedGTFSData):
    """Parses stop data from GTFS and inserts into MongoDB."""
    logger.info("--- Processing Stops ---")
    stops_to_insert: List[Stop] = []
    stops_processed = 0
    stops_skipped = 0

    stops_iter = parsed_gtfs.generate_stops()
    for stop in stops_iter:
        if stop:
            stops_processed += 1
            stops_to_insert.append(stop)
        else:
            stops_skipped += 1

    logger.info(f"Processed {stops_processed} stops data, skipped {stops_skipped}.")
    await _batch_insert(Stop, stops_to_insert)


async def process_and_insert_routes(parsed_gtfs: ParsedGTFSData):
    """Parses route data from GTFS and inserts into MongoDB."""
    logger.info("--- Processing Routes ---")
    routes_to_insert: List[Route] = []
    routes_processed = 0
    routes_skipped = 0

    routes_iter = parsed_gtfs.generate_routes()
    for route in routes_iter:
        if route:
            routes_processed += 1
            routes_to_insert.append(route)
        else:
            routes_skipped += 1

    logger.info(f"Processed {routes_processed} routes data, skipped {routes_skipped}.")
    await _batch_insert(Route, routes_to_insert)


async def process_and_insert_shapes(parsed_gtfs: ParsedGTFSData):
    """Parses shape data from GTFS and inserts into MongoDB."""
    logger.info("--- Processing Shapes ---")
    shapes_to_insert: List[Shape] = []
    shapes_processed = 0
    shapes_skipped = 0

    shapes_iter = parsed_gtfs.generate_shapes()
    for shape in shapes_iter:
        if shape:
            shapes_processed += 1
            shapes_to_insert.append(shape)
        else:
            shapes_skipped += 1

    logger.info(f"Processed {shapes_processed} shapes data, skipped {shapes_skipped}.")
    await _batch_insert(Shape, shapes_to_insert)


async def process_and_insert_scheduled_trips(
    parsed_gtfs: ParsedGTFSData,
    batch_size: int = INSERT_BATCH_SIZE,
) -> None:
    """
    Processes ScheduledTripDocument objects from an iterator and inserts them into the DB.
    """

    logger.info("--- Processing Scheduled Trips ---")

    trips_processed = 0
    trips_skipped = 0

    valid_trips_iter = parsed_gtfs.generate_scheduled_trips()

    def count_mw(doc: ScheduledTripDocument | None) -> ScheduledTripDocument | None:
        nonlocal trips_processed
        nonlocal trips_skipped
        if doc:
            trips_processed += 1
            return doc
        else:
            trips_skipped += 1
            return None

    valid_trips_iter: Iterator[ScheduledTripDocument] = filter(
        lambda doc: doc is not None, map(count_mw, valid_trips_iter)
    )
    await _batch_insert(ScheduledTripDocument, valid_trips_iter, batch_size)

    logger.info(
        f"Processed {trips_processed} scheduled trips data, skipped {trips_skipped}."
    )


async def start_import(drop_collections: bool = False):
    """Main async function to run the GTFS import process."""
    logger.info("=== Starting GTFS Data Import ===")

    # --- Connect to MongoDB ---
    client = None
    try:
        logger.info(f"Connecting to MongoDB at {MONGO_CONNECTION_STRING}...")
        client = AsyncIOMotorClient(MONGO_CONNECTION_STRING)
        await client.admin.command("ping")  # Verify connection
        logger.info("MongoDB connection successful.")

        if drop_collections:
            try:
                logger.info("Dropping existing collections...")
                for collection in DOCUMENT_MODELS:
                    await client[DATABASE_NAME][collection.Settings.name].drop()
                logger.info("Existing collections dropped.")
            except Exception as e:
                logger.error(f"Failed to drop existing collections: {e}", exc_info=True)
                return

        logger.info(f"Initializing Beanie with database '{DATABASE_NAME}'...")
        await init_beanie(
            database=client[DATABASE_NAME],
            document_models=DOCUMENT_MODELS,
        )
        logger.info("Beanie initialized.")

    except Exception as e:
        logger.error(
            f"Failed to connect to MongoDB or initialize Beanie: {e}", exc_info=True
        )
        return  # Exit if DB setup fails

    # --- Parse GTFS Data ---
    try:
        reader = GTFSReader()
        logger.info(f"Parsing GTFS data from '{GTFS_ZIP_FILE}'...")
        # Assuming parse returns an object holding dicts like parsed_gtfs.stops, parsed_gtfs.routes etc.
        parsed_gtfs: ParsedGTFSData = reader.parse(GTFS_ZIP_FILE)
        logger.info("GTFS parsing completed.")
    except Exception as e:
        logger.error(f"Failed during GTFS parsing: {e}", exc_info=True)
        return  # Exit if parsing fails

    # --- Process and Insert Data Concurrently ---
    logger.info("Starting concurrent processing and insertion of GTFS data...")
    try:
        tasks = [
            (process_and_insert_stops(parsed_gtfs)),
            (process_and_insert_routes(parsed_gtfs)),
            (process_and_insert_shapes(parsed_gtfs)),
            (process_and_insert_scheduled_trips(parsed_gtfs)),
        ]

        await asyncio.gather(
            *tasks,
            return_exceptions=False,
        )
        logger.info("All processing and insertion tasks completed.")

    except Exception as e:
        logger.error(
            f"An error occurred during concurrent data processing: {e}", exc_info=True
        )
    finally:
        if client:
            client.close()
            logger.info("MongoDB client closed.")

    logger.info("=== GTFS Data Import Finished ===")


def parse_arguments():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Process GTFS static data into MongoDB using Beanie.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    parser.add_argument(
        "-d",
        "--drop-collections",
        action="store_true",
        help="Drop existing collections before processing.",
    )

    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose logging.",
    )

    args = parser.parse_args()

    return args


def main():
    args = parse_arguments()

    global logger
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logger = setup_logger("static.main", log_level)

    try:
        asyncio.run(start_import(drop_collections=args.drop_collections))
    except KeyboardInterrupt:
        logger.warning("Ctrl+C detected. Exiting program BEFORE completing import.")
    except Exception as e:
        logger.critical(f"A critical error occurred: {e}", exc_info=True)
        sys.exit(1)
    finally:
        logger.info("Import process shutdown complete.")


if __name__ == "__main__":
    main()
