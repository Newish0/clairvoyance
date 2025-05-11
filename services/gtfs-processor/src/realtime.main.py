import asyncio
import argparse
import sys
import time 
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from models import ScheduledTripDocument
from parsing.gtfs_realtime import RealtimeUpdaterService
from config import setup_logger


# --- Configuration ---
MONGO_CONNECTION_STRING = (
    "mongodb://localhost:27017"  
)
DATABASE_NAME = "gtfs_data"

TRIP_UPDATES_URL = "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48"
VEHICLE_POSITIONS_URL = "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48"

# Setup logger
logger = setup_logger(__name__)

async def run_updates():
    """Performs one cycle of fetching and processing both feed types."""
    updater = RealtimeUpdaterService() 
    start_time = time.monotonic()
    logger.info("-" * 30)
    logger.info(f"Starting update cycle at {time.strftime('%Y-%m-%d %H:%M:%S')}")

    try:
        logger.info(f"Processing Trip Updates from {TRIP_UPDATES_URL}...")
        await updater.process_realtime_feed(TRIP_UPDATES_URL)
        logger.info("Trip Updates processed.")
    except Exception as e:
        logger.error(f"Error processing Trip Updates: {e}", exc_info=True)

    try:
        logger.info(f"Processing Vehicle Positions from {VEHICLE_POSITIONS_URL}...")
        await updater.process_realtime_feed(VEHICLE_POSITIONS_URL)
        logger.info("Vehicle Positions processed.")
    except Exception as e:
        logger.error(f"Error processing Vehicle Positions: {e}", exc_info=True)

    end_time = time.monotonic()
    logger.info(f"Update cycle finished in {end_time - start_time:.2f} seconds.")
    logger.info("-" * 30)


# --- Main Execution ---
async def main(interval_seconds: int | None):
    """
    Main function to initialize DB connection, Beanie, and run updates
    either once or periodically based on interval_seconds.
    """
    logger.info(f"Connecting to MongoDB ({MONGO_CONNECTION_STRING})")
    client = AsyncIOMotorClient(MONGO_CONNECTION_STRING)
    db = client[DATABASE_NAME]

    logger.info(f"Initializing Beanie for database '{DATABASE_NAME}'")
    await init_beanie(database=db, document_models=[ScheduledTripDocument])
    logger.info("Beanie initialized.")

    logger.info("Starting Realtime Feed Processing")

    if interval_seconds and interval_seconds > 0:
        # --- Periodic Updates ---
        logger.info(f"Running updates continuously every {interval_seconds} seconds.")
        logger.info("Press Ctrl+C to stop.")
        while True:
            try:
                await run_updates()
                logger.info(f"Waiting {interval_seconds} seconds for the next update cycle...")
                await asyncio.sleep(interval_seconds)
            except asyncio.CancelledError:
                logger.info("Shutdown signal received, stopping periodic updates.")
                break
            except Exception as e:
                logger.error(f"An unexpected error occurred in the main loop: {e}", exc_info=True)
                logger.info(f"Will attempt to recover and continue after {interval_seconds} seconds...")
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
            logger.error(f"An error occurred during the single update run: {e}", exc_info=True)
        logger.info("Single update run finished.")

    logger.info("Realtime Feed Processing Finished")


def parse_arguments():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Fetch and process GTFS-realtime data into MongoDB using Beanie.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument(
        "-i", "--interval",
        type=int,
        metavar='SECONDS',
        default=None,
        help="Interval in seconds for periodic updates. If not specified, runs only once."
    )

    args = parser.parse_args()

    if args.interval is not None and args.interval <= 0:
        parser.error("Interval must be a positive integer.")

    return args


if __name__ == "__main__":
    args = parse_arguments()

    try:
        asyncio.run(main(interval_seconds=args.interval))
    except KeyboardInterrupt:
        logger.info("Ctrl+C detected. Exiting program.")
    except Exception as e:
        logger.critical(f"A critical error occurred: {e}", exc_info=True)
        sys.exit(1)
    finally:
        logger.info("Program shutdown complete.")