import argparse
import asyncio
import logging
import sys
import os
from typing import List, Type
from beanie import Document, init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from ingest.batch_upsert import BatchUpsert
from ingest.gtfs_ingest_service import GTFSIngestService
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


async def start_import(
    gtfs_config,
    drop_collections: bool = False,
    logger: logging.Logger = logging.getLogger(__name__),
    batch_size: int = INSERT_BATCH_SIZE,
):
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

    # Initialize services
    upserter = BatchUpsert(batch_size=batch_size, logger=logger)
    ingest_service = GTFSIngestService(upserter=upserter, logger=logger)

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

        # --- Process and Insert Data ---
        try:
            await ingest_service.ingest_all(parsed_gtfs)
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

    parser.add_argument(
        "-b",
        "--batch-size",
        type=int,
        default=INSERT_BATCH_SIZE,
        help="Number of documents to insert in a single batch.",
    )

    args = parser.parse_args()

    return args


def main():
    args = parse_arguments()

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
        asyncio.run(
            start_import(
                gtfs_config=gtfs_config,
                drop_collections=args.drop_collections,
                logger=logger,
                batch_size=args.batch_size,
            )
        )
    except KeyboardInterrupt:
        logger.warning("Ctrl+C detected. Exiting program BEFORE completing import.")
    except Exception as e:
        logger.critical(f"A critical error occurred: {e}", exc_info=True)
        sys.exit(1)
    finally:
        logger.info("Import process shutdown complete.")


if __name__ == "__main__":
    main()
