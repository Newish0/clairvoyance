import argparse
import asyncio
from datetime import datetime
import logging
import sys
import os
from typing import Any, AsyncGenerator, Callable, Dict, Iterable, Iterator, List, Type
from beanie import Document, init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
import pytz
from parsing.gtfs_reader import GTFSReader, ParsedGTFSData
from models import Route, ScheduledTripDocument, Shape, Stop
from logger_config import setup_logger
import parsing.gtfs_config as gtfs_config_svc


# --- Configuration ---
MONGO_CONNECTION_STRING = (
    os.getenv("MONGO_CONNECTION_STRING") or "mongodb://localhost:27017"
)
DATABASE_NAME = os.getenv("MONGO_DB_NAME") or "gtfs_data"

INSERT_BATCH_SIZE = 300  # Batch size for all insert_many operations

DOCUMENT_MODELS: List[Type[Document]] = [
    Stop,
    Route,
    Shape,
    ScheduledTripDocument,
]

# --- Setup Logger ---
logger = None


class BatchUpsert:
    def __init__(
        self,
        batch_size: int = 100,
    ):
        self.batch_size = batch_size

    async def upsert(
        self,
        collection: Type[Document],
        items: Iterable[Document],
        key_fn: Callable[[Document], Dict[str, Any]],
        filter_fn: Callable[[Document], bool] | None = None,
    ):
        """
        Batch upsert with deep comparison and filtering.

        Args:
            collection (Type[Document]): Collection to upsert into.
            items (Iterable[Document]): Iterable of documents to upsert.
            key_fn (Callable[[Document], Dict[str, Any]]): Function to get key for upsert.
            filter_fn (Callable[[Document], bool], optional): Function to filter documents to upsert. (only include document if filter_fn(document) is True).
        """
        stats = {"inserted": 0, "updated": 0, "unchanged": 0, "total": 0, "errored": 0}

        async for batch in self._batched(items, filter_fn):
            batch_stats = await self._process_batch(collection, batch, key_fn)
            for k, v in batch_stats.items():
                stats[k] += v

        logger.info(f"{collection.__name__}: {stats}")

    async def _batched(
        self, items: Iterable, filter_fn: Callable[[Document], bool] | None = None
    ) -> AsyncGenerator[List, None]:
        """Yield batches of items."""
        batch = []
        for item in items:
            if filter_fn and not filter_fn(item):
                continue

            batch.append(item)
            if len(batch) >= self.batch_size:
                yield batch
                batch = []
        if batch:
            yield batch

    async def _process_batch(
        self,
        collection: Type[Document],
        batch: List[Document],
        key_fn: Callable,
        num_retries: int = 5,
    ) -> Dict[str, int]:
        """Process single batch with upsert logic."""
        stats = {"inserted": 0, "updated": 0, "unchanged": 0, "total": 0, "errored": 0}

        for doc in batch:
            stats["total"] += 1

            # Try upsert multiple times on fail
            for _ in range(num_retries):
                # Try to find existing document and do upsert if exists
                # If fail, just insert (pretend document doesn't exist)
                try:
                    existing = await collection.find_one(key_fn(doc))
                except Exception as e:
                    logger.error(
                        f"Failed to find existing document: {e}", exc_info=True
                    )
                    existing = None

                try:
                    if not existing:
                        await doc.insert()
                        stats["inserted"] += 1
                    elif self._differs(existing, doc):
                        doc.id = existing.id
                        doc.revision_id = existing.revision_id
                        await doc.replace()
                        stats["updated"] += 1
                    else:
                        stats["unchanged"] += 1
                except Exception as e:
                    logger.error(
                        f"Failed to upsert document: {e}. Retrying...", exc_info=True
                    )
                    continue

                break

        # Add errored count
        stats["errored"] = (
            stats["total"] - stats["inserted"] - stats["updated"] - stats["unchanged"]
        )

        return stats

    def _differs(self, doc1: Document, doc2: Document) -> bool:
        """Deep compare excluding _id and revision_id fields."""
        d1 = doc1.model_dump(exclude={"_id", "id", "revision_id"})
        d2 = doc2.model_dump(exclude={"_id", "id", "revision_id"})
        return d1 != d2


upserter = BatchUpsert(batch_size=INSERT_BATCH_SIZE)


KEY_FNS = {
    Stop: lambda d: {"stop_id": d.stop_id},
    Route: lambda d: {"route_id": d.route_id},
    Shape: lambda d: {"shape_id": d.shape_id},
    ScheduledTripDocument: lambda d: {
        "$or": [
            {
                "trip_id": d.trip_id,
                "start_date": d.start_date,
                "start_time": d.start_time,
            },
            {
                "route_id": d.route_id,
                "direction_id": d.direction_id,
                "start_date": d.start_date,
                "start_time": d.start_time,
            },
        ]
    },
}


# # --- Helper Functions for Processing and Insertion ---
# async def _batch_insert(
#     collection: Type[Document],  # Beanie Document class (e.g., Stop, Route)
#     items: Iterable[Document],
#     batch_size: int = INSERT_BATCH_SIZE,
# ):
#     """Helper to insert documents in batches."""
#     total_count = 0
#     num_batches = 0
#     batch = []
#     for item in items:
#         batch.append(item)
#         if len(batch) == batch_size:
#             num_batches += 1
#             await collection.insert_many(batch)
#             total_count += len(batch)
#             batch = []
#     if batch:
#         num_batches += 1
#         await collection.insert_many(batch)
#         total_count += len(batch)

#     logger.info(
#         f"Inserted {total_count} {collection.__name__} documents in {num_batches} batches of {batch_size}."
#     )


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
    # await _batch_insert(Stop, stops_to_insert)
    await upserter.upsert(Stop, stops_to_insert, KEY_FNS[Stop])


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
    # await _batch_insert(Route, routes_to_insert)
    await upserter.upsert(Route, routes_to_insert, KEY_FNS[Route])


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
    # await _batch_insert(Shape, shapes_to_insert)
    await upserter.upsert(Shape, shapes_to_insert, KEY_FNS[Shape])


async def process_and_insert_scheduled_trips(
    parsed_gtfs: ParsedGTFSData,
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
    # await _batch_insert(ScheduledTripDocument, valid_trips_iter, batch_size)
    await upserter.upsert(
        ScheduledTripDocument,
        valid_trips_iter,
        KEY_FNS[ScheduledTripDocument],
        filter_fn=lambda doc: doc.start_datetime is not None
        and doc.start_datetime > datetime.now().astimezone(tz=pytz.UTC),
    )

    logger.info(
        f"Processed {trips_processed} scheduled trips data, skipped {trips_skipped}."
    )


async def start_import(gtfs_config, drop_collections: bool = False):
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

    # Parse static GTFS data from each agency
    for agency in gtfs_config["agencies"]:
        agency_display_name = (
            f"{agency['name']} ({agency['id']})" if agency["name"] else agency["id"]
        )
        gtfs_static_source = (
            agency["static"]["url"]
            if "url" in agency["static"]
            else agency["static"]["file_path"]
        )

        try:
            reader = GTFSReader()
            logger.info(
                f"Parsing {agency_display_name} GTFS data from '{gtfs_static_source}'..."
            )
            parsed_gtfs: ParsedGTFSData = reader.parse(gtfs_static_source)
            logger.info(f"GTFS parsing for agency {agency_display_name} has completed.")
        except Exception as e:
            logger.error(
                f"Failed during GTFS parsing for agency {agency_display_name}: {e}",
                exc_info=True,
            )
            continue  # Skip to next agency

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
            logger.info(
                f"All processing and insertion tasks for {agency_display_name} has completed."
            )

        except Exception as e:
            logger.error(
                f"An error occurred during concurrent data processing for {agency_display_name}: {e}",
                exc_info=True,
            )

    if client:
        client.close()
        logger.info("MongoDB client closed.")

    logger.info(
        f"=== GTFS Data Import From {len(gtfs_config['agencies'])} Agencies Finished ==="
    )


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

    parser.add_argument(
        "-c",
        "--config",
        type=str,
        metavar="PATH",
        default=None,
        help="Path to GTFS configuration JSON file. If not specified, looks for 'gtfs_config.json' in current directory.",
    )

    args = parser.parse_args()

    return args


def main():
    args = parse_arguments()

    global logger
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logger = setup_logger("static.main", log_level)

    # Load and validate configuration
    try:
        gtfs_config = gtfs_config_svc.load_config(args.config)
        logger.info(
            f"Configuration loaded successfully from: {args.config or 'gtfs_config.json'}"
        )
    except gtfs_config_svc.ConfigurationError as e:
        logger.error(f"Configuration error: {e}")
        sys.exit(1)

    try:
        asyncio.run(start_import(gtfs_config, drop_collections=args.drop_collections))
    except KeyboardInterrupt:
        logger.warning("Ctrl+C detected. Exiting program BEFORE completing import.")
    except Exception as e:
        logger.critical(f"A critical error occurred: {e}", exc_info=True)
        sys.exit(1)
    finally:
        logger.info("Import process shutdown complete.")


if __name__ == "__main__":
    main()
