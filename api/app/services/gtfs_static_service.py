import requests
import json
import csv
from io import TextIOWrapper, BytesIO
from zipfile import ZipFile
from sqlalchemy.orm import Session
from datetime import datetime
import logging
from typing import Iterator, Dict, Any
from contextlib import contextmanager

from app.models.models import (
    Agency, Route, Stop, Trip, StopTime, Shape,
    CalendarDate
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GTFSLoader:
    def __init__(self, db: Session, batch_size: int = 1000):
        self.db = db
        self.batch_size = batch_size

    def load_agencies(self, agencies_file: str):
        """Load agencies from agencies.json into the database"""
        try:
            with open(agencies_file, "r") as f:
                agencies_data = json.load(f)

            for agency in agencies_data["agencies"]:
                db_agency = Agency(
                    id=agency["id"],
                    name=agency["name"],
                    static_gtfs_url=agency["static_gtfs_url"],
                    realtime_trip_updates_url=agency["realtime_trip_updates_url"],
                    realtime_vehicle_positions_url=agency["realtime_vehicle_positions_url"],
                    realtime_service_alerts_url=agency["realtime_service_alerts_url"],
                    timezone=agency.get("timezone", "UTC"),
                    lang=agency.get("lang"),
                    phone=agency.get("phone"),
                    fare_url=agency.get("fare_url"),
                    email=agency.get("email"),
                )
                self.db.merge(db_agency)
            self.db.commit()
            logger.info("Agencies loaded successfully")
        except Exception as e:
            self.db.rollback()
            raise Exception(f"Error loading agencies: {str(e)}")

    def download_and_load_static_gtfs(self, agency_id: str):
        """Download and load static GTFS data for an agency"""
        try:
            agency = self.db.query(Agency).filter(Agency.id == agency_id).first()
            if not agency:
                raise Exception(f"Agency {agency_id} not found")

            logger.info(f"Downloading GTFS data for agency {agency_id}")
            response = requests.get(agency.static_gtfs_url, timeout=30)
            response.raise_for_status()

            gtfs_zip = ZipFile(BytesIO(response.content))
            required_files = ["routes.txt", "stops.txt", "trips.txt", "stop_times.txt"]
            
            for file in required_files:
                if file not in gtfs_zip.namelist():
                    raise FileNotFoundError(f"Required file {file} not found in GTFS zip")

            # Process each file using generators and batch processing
            if "calendar_dates.txt" in gtfs_zip.namelist():
                logger.info("Loading calendar dates")
                with self._get_csv_reader(gtfs_zip, "calendar_dates.txt") as reader:
                    self._process_in_batches(self._process_calendar_dates(reader), CalendarDate)

            if "shapes.txt" in gtfs_zip.namelist():
                logger.info("Loading shapes")
                with self._get_csv_reader(gtfs_zip, "shapes.txt") as reader:
                    self._process_in_batches(self._process_shapes(reader), Shape)

            logger.info("Loading routes")
            with self._get_csv_reader(gtfs_zip, "routes.txt") as reader:
                self._process_in_batches(self._process_routes(reader, agency_id), Route)

            logger.info("Loading stops")
            with self._get_csv_reader(gtfs_zip, "stops.txt") as reader:
                self._process_in_batches(self._process_stops(reader), Stop)

            logger.info("Loading trips")
            with self._get_csv_reader(gtfs_zip, "trips.txt") as reader:
                self._process_in_batches(self._process_trips(reader), Trip)

            logger.info("Loading stop times")
            with self._get_csv_reader(gtfs_zip, "stop_times.txt") as reader:
                self._process_in_batches(self._process_stop_times(reader), StopTime)

            self.db.commit()
            logger.info("Static GTFS data loaded successfully")

        except Exception as e:
            self.db.rollback()
            raise Exception(f"Error processing GTFS data: {str(e)}") from e

    @contextmanager
    def _get_csv_reader(self, zip_file: ZipFile, filename: str) -> Iterator[csv.DictReader]:
        """Context manager to handle CSV reading from zip file"""
        with zip_file.open(filename) as csv_file:
            wrapped_file = TextIOWrapper(csv_file, encoding='utf-8-sig')
            yield csv.DictReader(wrapped_file)

    def _process_in_batches(self, items: Iterator[Dict[Any, Any]], model_class):
        """Process items in batches to reduce memory usage"""
        batch = []
        for item in items:
            batch.append(item)
            if len(batch) >= self.batch_size:
                self._flush_batch(batch, model_class)
                batch = []
        if batch:  # Flush any remaining items
            self._flush_batch(batch, model_class)

    def _flush_batch(self, batch: list, model_class):
        """Flush a batch of items to the database"""
        self.db.bulk_save_objects([model_class(**item) for item in batch])
        self.db.flush()

    def _process_calendar_dates(self, reader: csv.DictReader) -> Iterator[Dict[str, Any]]:
        """Process calendar dates from CSV reader"""
        for row in reader:
            yield {
                "service_id": str(row["service_id"]),
                "date": str(row["date"]),
                "exception_type": int(row["exception_type"])
            }

    def _process_shapes(self, reader: csv.DictReader) -> Iterator[Dict[str, Any]]:
        """Process shapes from CSV reader"""
        for row in reader:
            if not all(row.get(field) for field in ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"]):
                continue
            yield {
                "shape_id": str(row["shape_id"]),
                "shape_pt_lat": float(row["shape_pt_lat"]),
                "shape_pt_lon": float(row["shape_pt_lon"]),
                "shape_pt_sequence": int(row["shape_pt_sequence"]),
                "shape_dist_traveled": float(row["shape_dist_traveled"]) if row.get("shape_dist_traveled") else None
            }

    def _process_routes(self, reader: csv.DictReader, agency_id: str) -> Iterator[Dict[str, Any]]:
        """Process routes from CSV reader"""
        for row in reader:
            yield {
                "id": str(row["route_id"]),
                "agency_id": agency_id,
                "route_short_name": str(row.get("route_short_name", "")),
                "route_long_name": str(row.get("route_long_name", "")),
                "route_desc": str(row.get("route_desc", "")),
                "route_type": int(row["route_type"]),
                "route_url": str(row.get("route_url", "")),
                "route_color": str(row.get("route_color", "")),
                "route_text_color": str(row.get("route_text_color", "")),
                "route_sort_order": int(row["route_sort_order"]) if row.get("route_sort_order") else None,
                "continuous_pickup": int(row["continuous_pickup"]) if row.get("continuous_pickup") else None,
                "continuous_drop_off": int(row["continuous_drop_off"]) if row.get("continuous_drop_off") else None
            }

    def _process_stops(self, reader: csv.DictReader) -> Iterator[Dict[str, Any]]:
        """Process stops from CSV reader"""
        for row in reader:
            try:
                yield {
                    "id": str(row["stop_id"]),
                    "name": str(row["stop_name"]),
                    "lat": float(row["stop_lat"]),
                    "lon": float(row["stop_lon"]),
                    "code": str(row.get("stop_code", "")),
                    "desc": str(row.get("stop_desc", "")),
                    "zone_id": str(row.get("zone_id", "")),
                    "url": str(row.get("stop_url", "")),
                    "location_type": int(row.get("location_type", 0)),
                    "parent_station": str(row["parent_station"]) if row.get("parent_station") else None,
                    "timezone": str(row.get("stop_timezone", "")),
                    "wheelchair_boarding": int(row.get("wheelchair_boarding", 0)),
                    "level_id": str(row.get("level_id", "")),
                    "platform_code": str(row.get("platform_code", ""))
                }
            except (ValueError, KeyError) as e:
                logger.error(f"Error processing stop {row.get('stop_id')}: {str(e)}")
                continue

    def _process_trips(self, reader: csv.DictReader) -> Iterator[Dict[str, Any]]:
        """Process trips from CSV reader"""
        for row in reader:
            yield {
                "id": str(row["trip_id"]),
                "route_id": str(row["route_id"]),
                "service_id": str(row["service_id"]),
                "trip_headsign": str(row.get("trip_headsign", "")),
                "trip_short_name": str(row.get("trip_short_name", "")),
                "direction_id": int(row["direction_id"]) if row.get("direction_id") else None,
                "block_id": str(row.get("block_id", "")),
                "shape_id": str(row["shape_id"]) if row.get("shape_id") else None,
                "wheelchair_accessible": int(row.get("wheelchair_accessible", 0)),
                "bikes_allowed": int(row.get("bikes_allowed", 0))
            }

    def _process_stop_times(self, reader: csv.DictReader) -> Iterator[Dict[str, Any]]:
        """Process stop times from CSV reader"""
        for row in reader:
            try:
                yield {
                    "trip_id": str(row["trip_id"]),
                    "stop_id": str(row["stop_id"]),
                    "arrival_time": str(row["arrival_time"]),
                    "departure_time": str(row["departure_time"]),
                    "stop_sequence": int(row["stop_sequence"]),
                    "stop_headsign": str(row.get("stop_headsign", "")),
                    "pickup_type": int(row.get("pickup_type", 0)),
                    "drop_off_type": int(row.get("drop_off_type", 0)),
                    "shape_dist_traveled": float(row["shape_dist_traveled"]) if row.get("shape_dist_traveled") else None,
                    "timepoint": int(row.get("timepoint", 1)),
                    "continuous_pickup": int(row["continuous_pickup"]) if row.get("continuous_pickup") else None,
                    "continuous_drop_off": int(row["continuous_drop_off"]) if row.get("continuous_drop_off") else None
                }
            except (ValueError, KeyError) as e:
                logger.error(f"Error processing stop time for trip {row.get('trip_id')}: {str(e)}")
                continue