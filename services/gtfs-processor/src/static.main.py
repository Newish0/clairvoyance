import asyncio
import logging
from dataclasses import asdict
from typing import Iterator, List, Dict, Any, Type
from beanie import Document, init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

# Assuming these are defined in respective modules
from parsing.gtfs_reader import GTFSReader, ParsedGTFSData
from models import (
    ContinuousPickupDropOff,
    LineStringGeometry,
    LocationType,
    PointGeometry,
    Route,
    RouteType,
    ScheduledTripDocument,
    Shape,
    Stop,
    WheelchairBoarding,
)
from config import setup_logger

import os

# --- Configuration ---
MONGO_CONNECTION_STRING = (
    os.getenv("MONGO_CONNECTION_STRING") or "mongodb://localhost:27017"
)
DATABASE_NAME = os.getenv("MONGO_DB_NAME") or "gtfs_data"
GTFS_ZIP_FILE = "bctransit_gtfs.zip"

DROP_COLLECTIONS = True
INSERT_BATCH_SIZE = 750  # Batch size for all insert_many operations

DOCUMENT_MODELS: List[Type[Document]] = [
    Stop,
    Route,
    Shape,
    ScheduledTripDocument,
]

# --- Setup Logger ---
logger = setup_logger(__name__)


# --- Helper Functions for Processing and Insertion ---
async def _batch_insert(
    collection: Type[Document],  # Beanie Document class (e.g., Stop, Route)
    items: List[Document],
    batch_size: int = INSERT_BATCH_SIZE,
):
    """Helper to insert documents in batches."""
    if not items:
        logger.info(f"No items to insert for {collection.__name__}.")
        return
    logger.info(
        f"Inserting {len(items)} {collection.__name__} documents in batches of {batch_size}..."
    )
    inserted_count = 0
    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        if batch:
            try:
                await collection.insert_many(batch)
                inserted_count += len(batch)
                logger.debug(
                    f"Inserted batch {i//batch_size + 1} for {collection.__name__} ({len(batch)} items)"
                )
            except Exception as e:
                # Log the error but continue with the next batch if possible
                logger.error(
                    f"Error inserting batch {i//batch_size + 1} for {collection.__name__}: {e}",
                    exc_info=logger.isEnabledFor(logging.DEBUG),
                )
    logger.info(
        f"Successfully inserted {inserted_count} / {len(items)} {collection.__name__} documents."
    )


async def process_and_insert_stops(parsed_gtfs: ParsedGTFSData):
    """Parses stop data from GTFS and inserts into MongoDB."""
    logger.info("--- Processing Stops ---")
    stops_to_insert: List[Stop] = []
    stops_processed = 0
    stops_skipped = 0

    for stop_id, stop_data in parsed_gtfs.stops.items():
        stops_processed += 1
        try:
            # --- Location Geometry ---
            location_geom = None
            lat_str = stop_data.get("stop_lat")
            lon_str = stop_data.get("stop_lon")
            if lat_str and lon_str:  # Check for non-empty strings
                try:
                    lat = float(lat_str)
                    lon = float(lon_str)
                    location_geom = PointGeometry(
                        coordinates=[lon, lat]
                    )  # GeoJSON order
                except (ValueError, TypeError) as coord_err:
                    logger.debug(
                        f"Invalid coordinates for stop {stop_id}: lat='{lat_str}', lon='{lon_str}'. Skipping location. Error: {coord_err}"
                    )

            # --- Enums with Defaults ---
            loc_type_val = stop_data.get("location_type")
            location_type = LocationType.STOP  # Default
            if loc_type_val:
                try:
                    location_type = LocationType(int(loc_type_val))
                except (ValueError, TypeError):
                    logger.debug(
                        f"Invalid location_type '{loc_type_val}' for stop {stop_id}. Using default {location_type.name}."
                    )

            wc_val = stop_data.get("wheelchair_boarding")
            wheelchair_boarding = WheelchairBoarding.NO_INFO  # Default
            if wc_val:
                try:
                    wheelchair_boarding = WheelchairBoarding(int(wc_val))
                except (ValueError, TypeError):
                    logger.debug(
                        f"Invalid wheelchair_boarding '{wc_val}' for stop {stop_id}. Using default {wheelchair_boarding.name}."
                    )

            # --- Create Stop Document ---
            stop_doc = Stop(
                stop_id=stop_id,
                stop_code=stop_data.get("stop_code"),
                stop_name=stop_data.get("stop_name"),
                stop_desc=stop_data.get("stop_desc"),
                location=location_geom,
                zone_id=stop_data.get("zone_id"),
                stop_url=stop_data.get("stop_url"),
                location_type=location_type,
                parent_station_id=stop_data.get("parent_station"),
                stop_timezone=stop_data.get("stop_timezone"),
                wheelchair_boarding=wheelchair_boarding,
                level_id=stop_data.get("level_id"),
                platform_code=stop_data.get("platform_code"),
            )
            stops_to_insert.append(stop_doc)

        except Exception as e:
            stops_skipped += 1
            logger.warning(
                f"Error processing stop {stop_id}: {e}. Skipping.",
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )

    logger.info(f"Processed {stops_processed} stops data, skipped {stops_skipped}.")
    await _batch_insert(Stop, stops_to_insert)


async def process_and_insert_routes(parsed_gtfs: ParsedGTFSData):
    """Parses route data from GTFS and inserts into MongoDB."""
    logger.info("--- Processing Routes ---")
    routes_to_insert: List[Route] = []
    routes_processed = 0
    routes_skipped = 0

    for route_id, route_data in parsed_gtfs.routes.items():
        routes_processed += 1
        try:
            # --- Route Type (Mandatory) ---
            route_type_val = route_data.get("route_type")
            if not route_type_val:  # Check for None or empty string
                logger.warning(
                    f"Route {route_id} has missing or empty route_type. Skipping."
                )
                routes_skipped += 1
                continue
            try:
                route_type_enum = RouteType(int(route_type_val))
            except (ValueError, TypeError) as enum_err:
                logger.warning(
                    f"Invalid route_type '{route_type_val}' for route {route_id}: {enum_err}. Skipping."
                )
                routes_skipped += 1
                continue

            # --- Optional Enums with Defaults ---
            pickup_val = route_data.get("continuous_pickup")
            continuous_pickup = ContinuousPickupDropOff.NONE  # Default
            if pickup_val:
                try:
                    continuous_pickup = ContinuousPickupDropOff(int(pickup_val))
                except (ValueError, TypeError):
                    logger.debug(
                        f"Invalid continuous_pickup '{pickup_val}' for route {route_id}. Using default {continuous_pickup.name}."
                    )

            dropoff_val = route_data.get("continuous_drop_off")
            continuous_drop_off = ContinuousPickupDropOff.NONE  # Default
            if dropoff_val:
                try:
                    continuous_drop_off = ContinuousPickupDropOff(int(dropoff_val))
                except (ValueError, TypeError):
                    logger.debug(
                        f"Invalid continuous_drop_off '{dropoff_val}' for route {route_id}. Using default {continuous_drop_off.name}."
                    )

            # --- Optional Integer Conversion ---
            route_sort_order = None
            sort_order_str = route_data.get("route_sort_order")
            if sort_order_str:
                try:
                    route_sort_order = int(sort_order_str)
                except (ValueError, TypeError):
                    logger.debug(
                        f"Invalid route_sort_order '{sort_order_str}' for route {route_id}. Setting to None."
                    )

            # --- Create Route Document ---
            route_doc = Route(
                route_id=route_id,
                agency_id=route_data.get("agency_id"),
                route_short_name=route_data.get("route_short_name"),
                route_long_name=route_data.get("route_long_name"),
                route_desc=route_data.get("route_desc"),
                route_type=route_type_enum,
                route_url=route_data.get("route_url"),
                route_color=route_data.get("route_color"),
                route_text_color=route_data.get("route_text_color"),
                route_sort_order=route_sort_order,
                continuous_pickup=continuous_pickup,
                continuous_drop_off=continuous_drop_off,
            )
            routes_to_insert.append(route_doc)

        except Exception as e:
            routes_skipped += 1
            logger.warning(
                f"Error processing route {route_id}: {e}. Skipping.",
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )

    logger.info(f"Processed {routes_processed} routes data, skipped {routes_skipped}.")
    await _batch_insert(Route, routes_to_insert)


async def process_and_insert_shapes(parsed_gtfs: ParsedGTFSData):
    """Parses shape data from GTFS and inserts into MongoDB."""
    logger.info("--- Processing Shapes ---")
    shapes_to_insert: List[Shape] = []
    shapes_processed = 0
    shapes_skipped = 0

    # shapes data is Dict[str, List[Dict[str, Any]]] (shape_id -> list of points)
    for shape_id, shape_points_raw in parsed_gtfs.shapes.items():
        shapes_processed += 1
        coordinates = []
        distances = []
        point_parse_errors = 0
        has_valid_distance = False  # Track if any distance is valid

        try:
            # Points should already be sorted by sequence by the reader
            for point_row in shape_points_raw:
                try:
                    lat = float(point_row["shape_pt_lat"])
                    lon = float(point_row["shape_pt_lon"])
                    coordinates.append([lon, lat])  # GeoJSON order

                    # Handle distance (optional)
                    dist_str = point_row.get("shape_dist_traveled")
                    dist = None
                    if dist_str:  # Check for non-empty string
                        try:
                            dist = float(dist_str)
                            has_valid_distance = True  # Mark that we found at least one
                        except (ValueError, TypeError):
                            logger.debug(
                                f"Invalid shape_dist_traveled '{dist_str}' for point in shape {shape_id}. Appending None."
                            )
                    distances.append(dist)  # Append None if invalid or missing

                except (ValueError, TypeError, KeyError) as point_err:
                    point_parse_errors += 1
                    logger.debug(
                        f"Error parsing point for shape {shape_id}: {point_err} - Row: {point_row}. Skipping point."
                    )
                    # Continue processing other points for this shape

            if not coordinates:  # If no valid points were parsed at all
                logger.warning(
                    f"Shape {shape_id} has no valid coordinate points after parsing. Skipping shape."
                )
                shapes_skipped += 1
                continue  # Skip this shape entirely

            if point_parse_errors > 0:
                logger.warning(
                    f"Shape {shape_id} was processed with {point_parse_errors} point errors."
                )

            # --- Create Shape Document ---
            geometry = LineStringGeometry(coordinates=coordinates)
            shape_doc = Shape(
                shape_id=shape_id,
                geometry=geometry,
                # Only include distances if at least one valid distance was found
                distances_traveled=distances if has_valid_distance else None,
            )
            shapes_to_insert.append(shape_doc)

        except Exception as e:
            # Catch errors during shape document creation itself
            shapes_skipped += 1
            logger.warning(
                f"Error creating document for shape {shape_id}: {e}. Skipping.",
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )

    logger.info(f"Processed {shapes_processed} shapes data, skipped {shapes_skipped}.")
    await _batch_insert(Shape, shapes_to_insert)


d


async def process_and_insert_scheduled_trips(
    scheduled_trips_iterator: Iterator[
        ScheduledTripDocument
    ],  # Changed from List to Iterator
    batch_size: int = INSERT_BATCH_SIZE,
) -> None:
    """
    Processes ScheduledTripDocument objects from an iterator and inserts them into
    a database (e.g., MongoDB) in batches.
    """
    logger.info(
        f"--- Starting insertion of Scheduled Trips into MongoDB in batches of {batch_size} (from iterator) ---"
    )
    inserted_count = 0
    batches_processed = 0
    items_processed_from_iterator = 0
    current_batch: List[ScheduledTripDocument] = []

    # async def producer(queue: asyncio.Queue, num_items: int):
    #     """Producers generate random numbers and put them in the queue."""
    #     print("Producer: Starting")
    #     for i in range(num_items):
    #         item = random.randint(1, 100)
    #         print(f"Producer: Producing item {i+1}: {item}")
    #         await queue.put(item)
    #         await asyncio.sleep(random.uniform(0.1, 0.5)) # Simulate work

    #     print("Producer: Finished producing")
    #     # Signal the end of production (optional but useful)
    #     await queue.put(None)

    queue = asyncio.Queue()

    async def consumer(queue: asyncio.Queue):
        """Consumers get items from the queue and process them."""
        while True:
            batch = await queue.get()
            if batch is None:
                await queue.put(None)
                break

            try:
                await ScheduledTripDocument.insert_many(documents=batch)
                inserted_count += len(result.inserted_ids)
                logger.debug(
                    f"Successfully inserted batch {batches_processed} for Scheduled Trips ({len(result.inserted_ids)} items)."
                )
            except Exception as e:
                logger.error(
                    f"Error inserting batch {batches_processed} for Scheduled Trips: {e}. "
                    f"This batch of {len(current_batch)} trips may have failed.",
                    exc_info=logger.isEnabledFor(
                        logging.DEBUG
                    ),  # More detailed traceback if DEBUG
                )
            queue.task_done()  # Indicate that the item has been processed

    consumer_task = asyncio.create_task(consumer(queue))

    # Iterate through the input iterator
    for trip_doc in scheduled_trips_iterator:
        items_processed_from_iterator += 1
        current_batch.append(trip_doc)

        if len(current_batch) == batch_size:
            batches_processed += 1
            logger.debug(
                f"Processing batch {batches_processed} for Scheduled Trips ({len(current_batch)} items)"
            )

            await queue.put(current_batch)
            current_batch = []  # Reset for the next batch

    # After the loop, process any remaining items in the current_batch (the last, possibly smaller, batch)
    if current_batch:
        batches_processed += 1  # Even a partial batch is a batch processed
        logger.debug(
            f"Processing final batch {batches_processed} for Scheduled Trips ({len(current_batch)} items)"
        )
        await queue.put(current_batch)
        
    # Signal the end of production
    await queue.put(None)
        
    # Wait for all items to be processed
    await queue.join()
    await consumer_task

    if items_processed_from_iterator == 0:
        logger.info("No Scheduled Trips found from the iterator to insert.")
        return

    logger.info(
        f"Finished inserting Scheduled Trips. "
        f"Processed {items_processed_from_iterator} items from iterator in {batches_processed} batches. "
        f"Successfully inserted count reported by DB: {inserted_count} "
        f"(note: individual trip conversion errors prior to DB call are not explicitly counted here, "
        f"only batch-level DB insertion successes/failures)."
    )


# --- Main Execution ---
async def main():
    """Main async function to run the GTFS import process."""
    logger.info("=== Starting GTFS Data Import ===")

    # --- Connect to MongoDB ---
    client = None
    try:
        logger.info(f"Connecting to MongoDB at {MONGO_CONNECTION_STRING}...")
        client = AsyncIOMotorClient(MONGO_CONNECTION_STRING)
        await client.admin.command("ping")  # Verify connection
        logger.info("MongoDB connection successful.")

        if DROP_COLLECTIONS:
            logger.info("Dropping existing collections...")
            for collection in DOCUMENT_MODELS:
                await client[DATABASE_NAME][collection.Settings.name].drop()
            logger.info("Existing collections dropped.")

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

    # --- Generate Scheduled Trips ---
    try:
        logger.info("Generating Scheduled Trips objects...")
        scheduled_trips_iter = parsed_gtfs.generate_scheduled_trips()
        logger.info(f"Generated Scheduled Trips.")
    except Exception as e:
        logger.error(f"Failed during Scheduled Trip generation: {e}", exc_info=True)
        return  # Exit if trip generation fails

    # --- Process and Insert Data Concurrently ---
    logger.info("Starting concurrent processing and insertion of GTFS data...")
    try:
        # Create tasks for each entity type
        stops_task = asyncio.create_task(process_and_insert_stops(parsed_gtfs))
        routes_task = asyncio.create_task(process_and_insert_routes(parsed_gtfs))
        shapes_task = asyncio.create_task(process_and_insert_shapes(parsed_gtfs))
        trips_task = asyncio.create_task(
            process_and_insert_scheduled_trips(scheduled_trips_iter)
        )

        # Wait for all tasks to complete
        await asyncio.gather(
            stops_task,
            routes_task,
            shapes_task,
            trips_task,
            return_exceptions=False,  # Set to True to allow other tasks to finish if one fails
        )
        logger.info("All processing and insertion tasks completed.")

    except Exception as e:
        # Catch potential errors during task creation or gathering (less likely)
        logger.error(
            f"An error occurred during concurrent data processing: {e}", exc_info=True
        )
    finally:
        # Client cleanup isn't strictly necessary with modern Motor versions,
        # but can be good practice in some contexts.
        if client:
            client.close()
            logger.info("MongoDB client closed.")

    logger.info("=== GTFS Data Import Finished ===")


if __name__ == "__main__":
    asyncio.run(main())
