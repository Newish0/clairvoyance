import asyncio
import logging
from dataclasses import asdict
from typing import List, Dict, Any, Type
from beanie import Document, init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

# Assuming these are defined in respective modules
from parsing.gtfs_reader import GTFSReader, ParsedGTFSData
from domain import ScheduledTrip
from model import (
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

# --- Configuration ---
MONGO_CONNECTION_STRING = (
    "mongodb://localhost:27017"  # Replace with your MongoDB connection string
)
DATABASE_NAME = "gtfs_data"
GTFS_ZIP_FILE = "bctransit_gtfs.zip"  # Replace with your GTFS zip file path

INSERT_BATCH_SIZE = 2000  # Batch size for all insert_many operations
LOG_LEVEL = logging.INFO

# --- Setup Logger ---
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

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
                    exc_info=LOG_LEVEL <= logging.DEBUG,
                )
                # Optionally, attempt individual inserts within the failed batch for more resilience (adds complexity)
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
                exc_info=LOG_LEVEL <= logging.DEBUG,
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
                exc_info=LOG_LEVEL <= logging.DEBUG,
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
                exc_info=LOG_LEVEL <= logging.DEBUG,
            )

    logger.info(f"Processed {shapes_processed} shapes data, skipped {shapes_skipped}.")
    await _batch_insert(Shape, shapes_to_insert)


async def process_and_insert_scheduled_trips(
    domain_trips: List[ScheduledTrip], batch_size: int = INSERT_BATCH_SIZE
):
    """
    Converts domain ScheduledTrip objects to Beanie documents and inserts
    into MongoDB lazily in batches to conserve memory.
    """
    total_trips = len(domain_trips)
    if not total_trips:
        logger.info("No Scheduled Trips found to insert.")
        return

    logger.info(
        f"--- Inserting {total_trips} Scheduled Trips into MongoDB in batches of {batch_size} (lazy conversion) ---"
    )
    inserted_count = 0
    batches_processed = 0
    # Note: Tracking individual skips during lazy conversion within a batch is difficult
    # without pre-processing, which defeats the purpose. We'll log batch-level errors.

    for i in range(0, total_trips, batch_size):
        batch_slice = domain_trips[i : i + batch_size]
        batches_processed += 1
        if not batch_slice:  # Should not happen with range step, but safe check
            continue

        logger.debug(
            f"Processing batch {batches_processed} for Scheduled Trips ({len(batch_slice)} items)"
        )

        # Create an iterator that converts trips to documents JUST AS NEEDED by insert_many
        # This avoids loading all documents for the batch into memory at once.
        # The conversion (asdict) happens as the iterator is consumed.
        docs_iterator = map(
            lambda trip: ScheduledTripDocument(**asdict(trip)), batch_slice
        )

        try:
            # Beanie's insert_many can handle an iterator directly
            result = await ScheduledTripDocument.insert_many(
                documents=docs_iterator
            )  # Pass iterator to documents
            inserted_count += len(result.inserted_ids)
            logger.debug(
                f"Successfully inserted batch {batches_processed} for Scheduled Trips ({len(result.inserted_ids)} items)."
            )

        except Exception as e:
            # If an error occurs here, it could be during the conversion within the map
            # or during the actual bulk insert operation by the driver.
            # It's difficult to pinpoint the exact failing trip without trying one-by-one.
            logger.error(
                f"Error inserting batch {batches_processed} for Scheduled Trips: {e}. "
                f"This batch of {len(batch_slice)} trips may have failed.",
                exc_info=LOG_LEVEL <= logging.DEBUG,
            )
            # Option: Decide whether to continue to the next batch or raise/stop
            # continue

    logger.info(
        f"Finished inserting Scheduled Trips. Processed {batches_processed} batches. Successfully inserted count reported by DB: {inserted_count} (failures might reduce this)."
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

        logger.info(f"Initializing Beanie with database '{DATABASE_NAME}'...")
        await init_beanie(
            database=client[DATABASE_NAME],
            document_models=[
                Stop,
                Route,
                Shape,
                ScheduledTripDocument,
            ],
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

    # --- Generate Domain Objects (Scheduled Trips) ---
    # This might be memory-intensive depending on the GTFSReader implementation
    try:
        logger.info("Generating Scheduled Trips domain objects...")
        # Assuming this returns a list of domain objects (dataclasses or Pydantic models)
        domain_trips: List[ScheduledTrip] = parsed_gtfs.generate_scheduled_trips()
        logger.info(f"Generated {len(domain_trips)} Scheduled Trips.")
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
            process_and_insert_scheduled_trips(domain_trips)
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
