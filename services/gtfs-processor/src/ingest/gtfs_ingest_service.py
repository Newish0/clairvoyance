import asyncio
from datetime import datetime, timedelta
import logging
from logger_config import setup_logger
from typing import Callable, Iterator, List

import pytz
from ingest import BatchUpsert
from models import Route, ScheduledTripDocument, Shape, Stop
from parsing.parsed_gtfs_data import ParsedGTFSData


class GTFSIngestService:
    """Service for ingesting GTFS data into MongoDB."""

    def __init__(self, upserter: BatchUpsert, logger: logging.Logger = None):
        self.upserter = upserter
        self.logger = logger or setup_logger(__name__)

        # Key functions for each document type
        self.key_fns = {
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

        # Do not update trips that will depart in the next 24 hours.
        # they are likely already filled with RT data.
        self.trips_insert_only_fn: Callable[[ScheduledTripDocument], bool] = (
            lambda d: d.start_datetime < (datetime.now(pytz.UTC) + timedelta(days=1))
        )

    async def ingest_stops(self, parsed_gtfs: ParsedGTFSData) -> None:
        """Parses stop data from GTFS and inserts into MongoDB."""
        self.logger.info("--- Processing Stops ---")
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

        self.logger.info(
            f"Processed {stops_processed} stops data, skipped {stops_skipped}."
        )
        await self.upserter.upsert(Stop, stops_to_insert, self.key_fns[Stop])

    async def ingest_routes(self, parsed_gtfs: ParsedGTFSData) -> None:
        """Parses route data from GTFS and inserts into MongoDB."""
        self.logger.info("--- Processing Routes ---")
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

        self.logger.info(
            f"Processed {routes_processed} routes data, skipped {routes_skipped}."
        )
        await self.upserter.upsert(Route, routes_to_insert, self.key_fns[Route])

    async def ingest_shapes(self, parsed_gtfs: ParsedGTFSData) -> None:
        """Parses shape data from GTFS and inserts into MongoDB."""
        self.logger.info("--- Processing Shapes ---")
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

        self.logger.info(
            f"Processed {shapes_processed} shapes data, skipped {shapes_skipped}."
        )
        await self.upserter.upsert(Shape, shapes_to_insert, self.key_fns[Shape])

    async def ingest_scheduled_trips(self, parsed_gtfs: ParsedGTFSData) -> None:
        """
        Processes ScheduledTripDocument objects from an iterator and inserts them into the DB.
        """
        self.logger.info("--- Processing Scheduled Trips ---")

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

        await self.upserter.upsert(
            ScheduledTripDocument,
            valid_trips_iter,
            self.key_fns[ScheduledTripDocument],
            insert_only_fn=self.trips_insert_only_fn,
        )

        self.logger.info(
            f"Processed {trips_processed} scheduled trips data, skipped {trips_skipped}."
        )

    async def ingest_all(self, parsed_gtfs: ParsedGTFSData) -> None:
        """Ingest all GTFS data types concurrently."""
        self.logger.info("Starting concurrent processing and insertion of GTFS data...")

        tasks = [
            self.ingest_stops(parsed_gtfs),
            self.ingest_routes(parsed_gtfs),
            self.ingest_shapes(parsed_gtfs),
            self.ingest_scheduled_trips(parsed_gtfs),
        ]

        await asyncio.gather(*tasks, return_exceptions=False)
        self.logger.info("All processing and insertion tasks completed.")
