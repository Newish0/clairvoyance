import requests
import json
import pandas as pd
from io import BytesIO
from zipfile import ZipFile
from sqlalchemy.orm import Session
from google.transit import gtfs_realtime_pb2
from datetime import datetime
import logging

from app.models.models import (
    Agency,
    Route,
    Stop,
    Trip,
    StopTime,
    Shape,
    RealtimeTripUpdate,
    VehiclePosition,
    ServiceAlert,
    AlertEntity,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def load_agencies(db: Session, agencies_file: str):
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
                timezone=agency.get(
                    "timezone", "UTC"
                ),  # Default to UTC if not provided
                lang=agency.get("lang"),
                phone=agency.get("phone"),
                fare_url=agency.get("fare_url"),
                email=agency.get("email"),
            )
            db.merge(db_agency)
        db.commit()
        logger.info("Agencies loaded successfully")
    except FileNotFoundError:
        raise FileNotFoundError(f"Agencies file not found: {agencies_file}")
    except json.JSONDecodeError:
        raise ValueError(f"Invalid JSON format in {agencies_file}")
    except Exception as e:
        db.rollback()
        raise Exception(f"Error loading agencies: {str(e)}")


def download_and_load_static_gtfs(db: Session, agency_id: str):
    """Download and load static GTFS data for an agency"""
    try:
        agency = db.query(Agency).filter(Agency.id == agency_id).first()
        if not agency:
            raise Exception(f"Agency {agency_id} not found")

        # Download GTFS zip file
        logger.info(f"Downloading GTFS data for agency {agency_id}")
        response = requests.get(agency.static_gtfs_url, timeout=30)
        response.raise_for_status()

        gtfs_zip = ZipFile(BytesIO(response.content))
        required_files = ["routes.txt", "stops.txt", "trips.txt", "stop_times.txt"]
        optional_files = ["shapes.txt"]

        for file in required_files:
            if file not in gtfs_zip.namelist():
                raise FileNotFoundError(f"Required file {file} not found in GTFS zip")

        # Load shapes if available
        # Warning: Must load before trips since strips use shapes.shape_id as a foreign key.
        if "shapes.txt" in gtfs_zip.namelist():
            logger.info("Loading shapes")
            shapes_df = pd.read_csv(gtfs_zip.open("shapes.txt"))
            for _, shape in shapes_df.iterrows():
                try:
                    db_shape = Shape(
                        shape_id=str(shape["shape_id"]),
                        shape_pt_lat=float(shape["shape_pt_lat"]),
                        shape_pt_lon=float(shape["shape_pt_lon"]),
                        shape_pt_sequence=int(shape["shape_pt_sequence"]),
                        shape_dist_traveled=(
                            float(shape["shape_dist_traveled"])
                            if pd.notna(shape.get("shape_dist_traveled"))
                            else None
                        ),
                    )
                    db.add(db_shape)
                except ValueError as e:
                    logger.error(
                        f"Error processing shape {shape['shape_id']}: {str(e)}"
                    )
                    continue

        # Load routes
        logger.info("Loading routes")
        routes_df = pd.read_csv(gtfs_zip.open("routes.txt"))
        for _, route in routes_df.iterrows():
            db_route = Route(
                id=str(route["route_id"]),
                agency_id=agency_id,
                route_short_name=str(route.get("route_short_name", "")),
                route_long_name=str(route.get("route_long_name", "")),
                route_desc=str(route.get("route_desc", "")),
                route_type=int(route["route_type"]),
                route_url=str(route.get("route_url", "")),
                route_color=str(route.get("route_color", "")),
                route_text_color=str(route.get("route_text_color", "")),
                route_sort_order=(
                    int(route.get("route_sort_order", 0))
                    if pd.notna(route.get("route_sort_order"))
                    else None
                ),
                continuous_pickup=(
                    int(route.get("continuous_pickup", 0))
                    if pd.notna(route.get("continuous_pickup"))
                    else None
                ),
                continuous_drop_off=(
                    int(route.get("continuous_drop_off", 0))
                    if pd.notna(route.get("continuous_drop_off"))
                    else None
                ),
            )
            db.merge(db_route)

        # Load stops
        logger.info("Loading stops")
        stops_df = pd.read_csv(gtfs_zip.open("stops.txt"))
        for _, stop in stops_df.iterrows():
            try:
                db_stop = Stop(
                    id=str(stop["stop_id"]),
                    name=str(stop["stop_name"]),
                    lat=float(stop["stop_lat"]),
                    lon=float(stop["stop_lon"]),
                    code=str(stop.get("stop_code", "")),
                    desc=str(stop.get("stop_desc", "")),
                    zone_id=str(stop.get("zone_id", "")),
                    url=str(stop.get("stop_url", "")),
                    location_type=(
                        int(stop.get("location_type", 0))
                        if pd.notna(stop.get("location_type"))
                        else 0
                    ),
                    parent_station=(
                        str(stop.get("parent_station", ""))
                        if pd.notna(stop.get("parent_station"))
                        else None
                    ),
                    timezone=str(stop.get("stop_timezone", "")),
                    wheelchair_boarding=(
                        int(stop.get("wheelchair_boarding", 0))
                        if pd.notna(stop.get("wheelchair_boarding"))
                        else None
                    ),
                    level_id=str(stop.get("level_id", "")),
                    platform_code=str(stop.get("platform_code", "")),
                )
                db.merge(db_stop)
            except ValueError as e:
                logger.error(f"Error processing stop {stop['stop_id']}: {str(e)}")
                continue

        # Load trips
        logger.info("Loading trips")
        trips_df = pd.read_csv(gtfs_zip.open("trips.txt"))
        for _, trip in trips_df.iterrows():
            db_trip = Trip(
                id=str(trip["trip_id"]),
                route_id=str(trip["route_id"]),
                service_id=str(trip["service_id"]),
                trip_headsign=str(trip.get("trip_headsign", "")),
                trip_short_name=str(trip.get("trip_short_name", "")),
                direction_id=(
                    int(trip.get("direction_id", 0))
                    if pd.notna(trip.get("direction_id"))
                    else None
                ),
                block_id=str(trip.get("block_id", "")),
                shape_id=(
                    str(trip.get("shape_id", ""))
                    if pd.notna(trip.get("shape_id"))
                    else None
                ),
                wheelchair_accessible=(
                    int(trip.get("wheelchair_accessible", 0))
                    if pd.notna(trip.get("wheelchair_accessible"))
                    else None
                ),
                bikes_allowed=(
                    int(trip.get("bikes_allowed", 0))
                    if pd.notna(trip.get("bikes_allowed"))
                    else None
                ),
            )
            db.merge(db_trip)

        # Load stop times
        logger.info("Loading stop times")
        stop_times_df = pd.read_csv(gtfs_zip.open("stop_times.txt"))
        for _, stop_time in stop_times_df.iterrows():
            try:
                db_stop_time = StopTime(
                    trip_id=str(stop_time["trip_id"]),
                    stop_id=str(
                        stop_time["stop_id"]
                    ),  # Changed from int to str to match model
                    arrival_time=str(stop_time["arrival_time"]),
                    departure_time=str(stop_time["departure_time"]),
                    stop_sequence=int(stop_time["stop_sequence"]),
                    stop_headsign=str(stop_time.get("stop_headsign", "")),
                    pickup_type=(
                        int(stop_time.get("pickup_type", 0))
                        if pd.notna(stop_time.get("pickup_type"))
                        else 0
                    ),
                    drop_off_type=(
                        int(stop_time.get("drop_off_type", 0))
                        if pd.notna(stop_time.get("drop_off_type"))
                        else 0
                    ),
                    shape_dist_traveled=(
                        float(stop_time.get("shape_dist_traveled", 0))
                        if pd.notna(stop_time.get("shape_dist_traveled"))
                        else None
                    ),
                    timepoint=(
                        int(stop_time.get("timepoint", 1))
                        if pd.notna(stop_time.get("timepoint"))
                        else 1
                    ),
                    continuous_pickup=(
                        int(stop_time.get("continuous_pickup", 0))
                        if pd.notna(stop_time.get("continuous_pickup"))
                        else None
                    ),
                    continuous_drop_off=(
                        int(stop_time.get("continuous_drop_off", 0))
                        if pd.notna(stop_time.get("continuous_drop_off"))
                        else None
                    ),
                )
                db.add(db_stop_time)
            except ValueError as e:
                logger.error(f"Error processing stop time: {str(e)}")
                continue

        db.commit()
        logger.info("Static GTFS data loaded successfully")
    except requests.RequestException as e:
        raise Exception(f"Error downloading GTFS data: {str(e)}") from e
    except Exception as e:
        db.rollback()
        raise Exception(f"Error processing GTFS data: {str(e)}") from e
