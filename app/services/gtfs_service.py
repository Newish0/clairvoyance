import requests
import json
import pandas as pd
from io import BytesIO
from zipfile import ZipFile
from sqlalchemy.orm import Session
from google.transit import gtfs_realtime_pb2
from datetime import datetime
import logging

from app.models.models import Agency, Route, Stop, Trip, StopTime, RealtimeUpdate

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
                realtime_gtfs_url=agency["realtime_gtfs_url"],
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
        for file in required_files:
            if file not in gtfs_zip.namelist():
                raise FileNotFoundError(f"Required file {file} not found in GTFS zip")

        # Load routes
        logger.info("Loading routes")
        routes_df = pd.read_csv(gtfs_zip.open("routes.txt"))
        for _, route in routes_df.iterrows():
            db_route = Route(
                id=str(route["route_id"]),  # Ensure string type
                agency_id=agency_id,
                route_short_name=str(route.get("route_short_name", "")),
                route_long_name=str(route.get("route_long_name", "")),
                route_type=int(route["route_type"]),
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
            )
            db.merge(db_trip)

        # Load stop times
        logger.info("Loading stop times")
        stop_times_df = pd.read_csv(gtfs_zip.open("stop_times.txt"))
        for _, stop_time in stop_times_df.iterrows():
            try:
                db_stop_time = StopTime(
                    trip_id=str(stop_time["trip_id"]),
                    stop_id=int(stop_time["stop_id"]),
                    arrival_time=str(stop_time["arrival_time"]),
                    departure_time=str(stop_time["departure_time"]),
                    stop_sequence=int(stop_time["stop_sequence"]),
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

def fetch_realtime_updates(db: Session, agency_id: str):
    """Fetch and store realtime GTFS updates for an agency"""
    try:
        agency = db.query(Agency).filter(Agency.id == agency_id).first()
        if not agency:
            raise Exception(f"Agency {agency_id} not found")

        logger.info(f"Fetching realtime updates for agency {agency_id}")
        response = requests.get(agency.realtime_gtfs_url, timeout=30)
        response.raise_for_status()

        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)

        current_time = datetime.now()
        updates_count = 0

        for entity in feed.entity:
            if entity.HasField("trip_update"):
                trip_update = entity.trip_update
                for stop_time_update in trip_update.stop_time_update:
                    try:
                        db_update = RealtimeUpdate(
                            trip_id=str(trip_update.trip.trip_id),
                            stop_id=int(stop_time_update.stop_id),
                            arrival_delay=(
                                stop_time_update.arrival.delay
                                if stop_time_update.HasField("arrival")
                                else None
                            ),
                            departure_delay=(
                                stop_time_update.departure.delay
                                if stop_time_update.HasField("departure")
                                else None
                            ),
                            timestamp=current_time,
                            vehicle_id=(
                                trip_update.vehicle.id
                                if trip_update.HasField("vehicle")
                                else None
                            ),
                            current_status=(
                                trip_update.trip.schedule_relationship.name
                                if trip_update.trip.HasField("schedule_relationship")
                                else None
                            ),
                        )
                        db.add(db_update)
                        updates_count += 1
                    except ValueError as e:
                        logger.error(f"Error processing realtime update: {str(e)}")
                        continue

        db.commit()
        logger.info(
            f"Realtime updates loaded successfully: {updates_count} updates processed"
        )
    except requests.RequestException as e:
        raise Exception(f"Error fetching realtime data: {str(e)}")
    except Exception as e:
        db.rollback()
        raise Exception(f"Error processing realtime data: {str(e)}") 