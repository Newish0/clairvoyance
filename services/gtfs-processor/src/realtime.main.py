import asyncio
import argparse
import logging
import sys
import time
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from models import ScheduledTripDocument, Alert
from parsing.gtfs_realtime import RealtimeUpdaterService
from config import setup_logger
import os


# --- Configuration ---
MONGO_CONNECTION_STRING = (
    os.getenv("MONGO_CONNECTION_STRING") or "mongodb://localhost:27017"
)
DATABASE_NAME = os.getenv("MONGO_DB_NAME") or "gtfs_data"

AGENCY_ID = "BCT-48"
TRIP_UPDATES_URL = "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48"
VEHICLE_UPDATES_URL = (
    "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48"
)
ALERTS_URL = "https://bct.tmix.se/gtfs-realtime/alerts.pb?operatorIds=48"


SOURCES = [
    {"url": TRIP_UPDATES_URL, "name": "Trip Updates"},
    {"url": VEHICLE_UPDATES_URL, "name": "Vehicle Updates"},
    {"url": ALERTS_URL, "name": "Alerts"},
]

logger = None


async def run_updates():
    """Performs one cycle of fetching and processing both feed types."""
    updater = RealtimeUpdaterService(agency_id=AGENCY_ID, logger=logger)
    start_time = time.monotonic()
    logger.info("-" * 30)
    logger.info(f"Starting update cycle at {time.strftime('%Y-%m-%d %H:%M:%S')}")

    for source in SOURCES:
        try:
            logger.info(f"Processing {source['name']} from {source['url']}...")
            result = await updater.process_realtime_feed(source["url"])
            logger.info(f"{source['name']} processed.")
            logger.info(str(result))
        except Exception as e:
            logger.error(f"Error processing {source['name']}: {e}", exc_info=True)

    logger.info("Marking timed out alerts as ended...")
    num_marked = await updater.mark_timed_out_alerts()
    logger.info(
        f"{num_marked} alerts has not been seen for {updater.alert_end_timeout} seconds--marked as ended."
    )

    end_time = time.monotonic()
    logger.info(f"Update cycle finished in {end_time - start_time:.2f} seconds.")
    logger.info("-" * 30)


async def init(interval_seconds: int | None):
    """
    Initialize DB connection, Beanie, and run updates
    either once or periodically based on interval_seconds.
    """
    logger.info(f"Connecting to MongoDB ({MONGO_CONNECTION_STRING})")
    client = AsyncIOMotorClient(MONGO_CONNECTION_STRING)
    db = client[DATABASE_NAME]

    logger.info(f"Initializing Beanie for database '{DATABASE_NAME}'")
    await init_beanie(database=db, document_models=[ScheduledTripDocument, Alert])
    logger.info("Beanie initialized.")

    logger.info("Starting Realtime Feed Processing")

    if interval_seconds and interval_seconds > 0:
        # --- Periodic Updates ---
        logger.info(f"Running updates continuously every {interval_seconds} seconds.")
        logger.info("Press Ctrl+C to stop.")
        while True:
            try:
                await run_updates()
                logger.info(
                    f"Waiting {interval_seconds} seconds for the next update cycle..."
                )
                await asyncio.sleep(interval_seconds)
            except asyncio.CancelledError:
                logger.info("Shutdown signal received, stopping periodic updates.")
                break
            except Exception as e:
                logger.error(
                    f"An unexpected error occurred in the main loop: {e}", exc_info=True
                )
                logger.info(
                    f"Will attempt to recover and continue after {interval_seconds} seconds..."
                )
                try:
                    await asyncio.sleep(interval_seconds)
                except asyncio.CancelledError:
                    logger.info("Shutdown signal received during error recovery wait.")
                    break
    else:
        # --- Single Run ---
        logger.info("Running a single update.")
        try:
            await run_updates()
        except Exception as e:
            logger.error(
                f"An error occurred during the single update run: {e}", exc_info=True
            )
        logger.info("Single update run finished.")

    logger.info("Realtime Feed Processing Finished")


def parse_arguments():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Fetch and process GTFS-realtime data into MongoDB using Beanie.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "-i",
        "--interval",
        type=int,
        metavar="SECONDS",
        default=None,
        help="Interval in seconds for periodic updates. If not specified, runs only once.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose logging.",
    )

    args = parser.parse_args()

    if args.interval is not None and args.interval <= 0:
        parser.error("Interval must be a positive integer.")

    return args


def main():
    args = parse_arguments()

    global logger
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logger = setup_logger("realtime.main", log_level)

    try:
        asyncio.run(init(interval_seconds=args.interval))
    except KeyboardInterrupt:
        logger.info("Ctrl+C detected. Exiting program.")
    except Exception as e:
        logger.critical(f"A critical error occurred: {e}", exc_info=True)
        sys.exit(1)
    finally:
        logger.info("Program shutdown complete.")


if __name__ == "__main__":
    main()
