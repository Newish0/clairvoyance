import asyncio
from dataclasses import asdict
from typing import List
from motor.motor_asyncio import AsyncIOMotorClient
from parsing.gtfs_reader import GTFSReader
from domain import ScheduledTrip
from beanie import init_beanie
from model import ScheduledTripDocument

# --- Configuration ---
MONGO_CONNECTION_STRING = (
    "mongodb://localhost:27017"  # Replace with your MongoDB connection string
)
DATABASE_NAME = "gtfs_data"
GTFS_ZIP_FILE = "bctransit_gtfs.zip"  

INSERT_BATCH_SIZE = 2000

# --- Main Execution ---
async def main():
    print(f"\n--- Connecting to MongoDB ---")
    client = AsyncIOMotorClient(MONGO_CONNECTION_STRING)

    print(f"\n--- Initializing Beanie ---")
    await init_beanie(database=client[DATABASE_NAME], document_models=[ScheduledTripDocument])

    reader = GTFSReader()

    print(f"\n--- Parsing GTFS ---")
    parsed_gtfs = reader.parse(GTFS_ZIP_FILE)

    print(f"\n--- Generating Scheduled Trips ---")
    domain_trips: List[ScheduledTrip] = parsed_gtfs.generate_scheduled_trips()

    print(f"\n--- Inserting Scheduled Trips into MongoDB ---")
    # Insert in batch (conversion to dict is expensive so doing it lazily in batch)
    for i in range(0, len(domain_trips), INSERT_BATCH_SIZE):
        await ScheduledTripDocument.insert_many(
            map(lambda trip: ScheduledTripDocument(**asdict(trip)), domain_trips[i:i+INSERT_BATCH_SIZE])
        )


if __name__ == "__main__":
    asyncio.run(main())
