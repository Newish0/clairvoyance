import asyncio
import argparse
import sys
import time 
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from model import ScheduledTripDocument
from parsing.gtfs_realtime import RealtimeUpdaterService


# --- Configuration ---
MONGO_CONNECTION_STRING = (
    "mongodb://localhost:27017"  
)
DATABASE_NAME = "gtfs_data"

TRIP_UPDATES_URL = "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48"
VEHICLE_POSITIONS_URL = "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48"


async def run_updates():
    """Performs one cycle of fetching and processing both feed types."""
    updater = RealtimeUpdaterService() 
    start_time = time.monotonic()
    print("-" * 30)
    print(f"Starting update cycle at {time.strftime('%Y-%m-%d %H:%M:%S')}")

    try:
        print(f"Processing Trip Updates from {TRIP_UPDATES_URL}...")
        await updater.process_realtime_feed(TRIP_UPDATES_URL)
        print("Trip Updates processed.")
    except Exception as e:
        print(f"\n*** Error processing Trip Updates: {e} ***")
        # Decide if you want to continue with vehicle positions or skip the cycle

    try:
        print(f"\nProcessing Vehicle Positions from {VEHICLE_POSITIONS_URL}...")
        await updater.process_realtime_feed(VEHICLE_POSITIONS_URL)
        print("Vehicle Positions processed.")
    except Exception as e:
        print(f"\n*** Error processing Vehicle Positions: {e} ***")

    end_time = time.monotonic()
    print(f"Update cycle finished in {end_time - start_time:.2f} seconds.")
    print("-" * 30)


# --- Main Execution ---
async def main(interval_seconds: int | None):
    """
    Main function to initialize DB connection, Beanie, and run updates
    either once or periodically based on interval_seconds.
    """
    print(f"\n--- Connecting to MongoDB ({MONGO_CONNECTION_STRING}) ---")
    client = AsyncIOMotorClient(MONGO_CONNECTION_STRING)
    db = client[DATABASE_NAME]

    print(f"\n--- Initializing Beanie for database '{DATABASE_NAME}' ---")
    await init_beanie(database=db, document_models=[ScheduledTripDocument])
    print("Beanie initialized.")

    print(f"\n--- Starting Realtime Feed Processing ---")

    if interval_seconds and interval_seconds > 0:
        # --- Periodic Updates ---
        print(f"Running updates continuously every {interval_seconds} seconds.")
        print("Press Ctrl+C to stop.")
        while True:
            try:
                await run_updates()
                print(f"Waiting {interval_seconds} seconds for the next update cycle...")
                await asyncio.sleep(interval_seconds)
            except asyncio.CancelledError:
                # This happens when asyncio.run() catches KeyboardInterrupt
                print("\nShutdown signal received, stopping periodic updates.")
                break
            except Exception as e:
                # Catch unexpected errors during the update or sleep
                print(f"\n*** An unexpected error occurred in the main loop: {e} ***")
                print(f"Will attempt to recover and continue after {interval_seconds} seconds...")
                try:
                    await asyncio.sleep(interval_seconds) # Wait before retrying
                except asyncio.CancelledError:
                    print("\nShutdown signal received during error recovery wait.")
                    break
    else:
        # --- Single Run ---
        print("Running a single update.")
        try:
            await run_updates()
        except Exception as e:
            print(f"\n*** An error occurred during the single update run: {e} ***")
        print("Single update run finished.")

    print("\n--- Realtime Feed Processing Finished ---")



def parse_arguments():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Fetch and process GTFS-realtime data into MongoDB using Beanie.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter # Show defaults in help
    )
    parser.add_argument(
        "-i", "--interval",
        type=int,
        metavar='SECONDS',
        default=None, # Run once by default
        help="Interval in seconds for periodic updates. If not specified, runs only once."
    )

    args = parser.parse_args()

    if args.interval is not None and args.interval <= 0:
        parser.error("Interval must be a positive integer.")

    return args


if __name__ == "__main__":
    args = parse_arguments()

    try:
        # Pass the parsed interval to the main async function
        asyncio.run(main(interval_seconds=args.interval))
    except KeyboardInterrupt:
        # Gracefully handle Ctrl+C
        print("\nCtrl+C detected. Exiting program.")
    except Exception as e:
        # Catch any other unexpected exceptions during startup/shutdown
        print(f"\n*** A critical error occurred: {e} ***")
        sys.exit(1)
    finally:
        print("Program shutdown complete.")