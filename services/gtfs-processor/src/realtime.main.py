

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from model import ScheduledTripDocument
from parsing.gtfs_realtime import RealtimeUpdaterService

# --- Configuration ---
MONGO_CONNECTION_STRING = (
    "mongodb://localhost:27017"  # Replace with your MongoDB connection string
)
DATABASE_NAME = "gtfs_data"

TRIP_UPDATES_URL = "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48"
VEHICLE_POSITIONS_URL = "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48"


# --- Main Execution ---
async def main():
    print(f"\n--- Connecting to MongoDB ---")
    client = AsyncIOMotorClient(MONGO_CONNECTION_STRING)

    print(f"\n--- Initializing Beanie ---")
    await init_beanie(database=client[DATABASE_NAME], document_models=[ScheduledTripDocument])

    updater = RealtimeUpdaterService()

    print(f"Processing Trip Updates from {TRIP_UPDATES_URL}...")
    await updater.process_realtime_feed(TRIP_UPDATES_URL)

    print(f"\nProcessing Vehicle Positions from {VEHICLE_POSITIONS_URL}...")
    await updater.process_realtime_feed(VEHICLE_POSITIONS_URL)



if __name__ == "__main__":
    asyncio.run(main())
