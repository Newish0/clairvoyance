import threading
import requests
from sqlalchemy.orm import Session
from google.transit import gtfs_realtime_pb2
from google.protobuf.message import Message
from typing import Optional, Tuple, List
from datetime import datetime
import logging

from app.models.models import (
    Agency,
    RealtimeTripUpdate,
    VehiclePosition,
    ServiceAlert,
    AlertEntity,
)


logger = logging.getLogger(__name__)


class VehiclePositionFetcher:
    def __init__(self, db: Session):
        self.db = db
        self.VehicleStopStatus = gtfs_realtime_pb2.VehiclePosition.VehicleStopStatus
        self.CongestionLevel = gtfs_realtime_pb2.VehiclePosition.CongestionLevel
        self.OccupancyStatus = gtfs_realtime_pb2.VehiclePosition.OccupancyStatus

        self._stop_event = threading.Event()
        self._background_thread = None

    def start_background_fetch(self, agency_id: str, polling_interval=30) -> None:
        """Start background fetching for the specified agency."""
        if self._background_thread and self._background_thread.is_alive():
            raise RuntimeError("Background fetch already running")

        self._stop_event.clear()
        self._background_thread = threading.Thread(
            target=self._background_fetch_loop,
            args=(
                agency_id,
                polling_interval,
            ),
            daemon=True,
        )
        self._background_thread.start()
        logger.info(f"Started background fetching for agency {agency_id}")

    def stop_background_fetch(self) -> None:
        """Stop background fetching."""
        if self._background_thread:
            self._stop_event.set()
            self._background_thread.join()
            logger.info("Stopped background fetching")

    def join_background_fetch(self) -> None: 
        if self._background_thread:
            self._background_thread.join()

    def _background_fetch_loop(self, agency_id: str, polling_interval: int) -> None:
        """Background loop for fetching vehicle positions."""
        while not self._stop_event.is_set():
            try:
                success_count, total_count = self.fetch_vehicle_positions(
                    agency_id
                )
                logger.info(
                    f"Background fetch completed: {success_count}/{total_count} positions processed"
                )
            except Exception as e:
                logger.error(f"Error in background fetch: {str(e)}")

            # Wait for the next interval or until stopped
            self._stop_event.wait(polling_interval)

    def fetch_vehicle_positions(self, agency_id: str) -> Tuple[int, int]:
        """
        Main function to fetch and store realtime vehicle positions for an agency.
        Returns tuple of (success_count, total_positions_count)
        """
        agency = self._get_agency(agency_id)
        feed = self._fetch_gtfs_feed(agency.realtime_vehicle_positions_url)
        return self._process_feed(feed, agency_id)

    def _get_agency(self, agency_id: str) -> Agency:
        """Fetch agency from database and validate it has required URL."""
        agency = self.db.query(Agency).filter(Agency.id == agency_id).first()
        if not agency or not agency.realtime_vehicle_positions_url:
            raise Exception(
                f"Agency {agency_id} not found or missing vehicle positions URL"
            )
        return agency

    def _fetch_gtfs_feed(self, url: str) -> Message:
        """Fetch and parse GTFS realtime feed from URL."""
        try:
            logger.info(f"Fetching vehicle positions from {url}")
            response = requests.get(url, timeout=30)
            response.raise_for_status()

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)
            return feed
        except requests.RequestException as e:
            raise Exception(f"Error fetching vehicle positions: {str(e)}")

    def _process_feed(self, feed: Message, agency_id: str) -> Tuple[int, int]:
        """Process GTFS feed and store vehicle positions."""
        positions_count = success_count = 0
        current_time = datetime.now()

        for entity in feed.entity:
            if not entity.HasField("vehicle"):
                continue

            try:
                if self._process_vehicle_entity(
                    entity.vehicle, agency_id, current_time
                ):
                    success_count += 1
                positions_count += 1
            except ValueError as e:
                logger.error(f"Error processing vehicle position: {str(e)}")
                continue

        logger.info(
            f"Vehicle positions loaded successfully: {success_count}/{positions_count} positions processed"
        )
        return success_count, positions_count

    def _process_vehicle_entity(
        self, vehicle: Message, agency_id: str, current_time: datetime
    ) -> bool:
        """Process single vehicle entity and store in database. Returns success status."""
        position_timestamp = self._get_position_timestamp(vehicle, current_time)

        if self._is_duplicate_position(vehicle, position_timestamp):
            return False

        db_position = self._create_vehicle_position(
            vehicle, position_timestamp, agency_id
        )
        return self._save_position(db_position)

    def _get_position_timestamp(
        self, vehicle: Message, current_time: datetime
    ) -> datetime:
        """Get timestamp for vehicle position."""
        return (
            datetime.fromtimestamp(vehicle.timestamp)
            if vehicle.HasField("timestamp")
            else current_time
        )

    def _is_duplicate_position(self, vehicle: Message, timestamp: datetime) -> bool:
        """Check if position already exists in database."""
        existing_position = (
            self.db.query(VehiclePosition)
            .filter(
                VehiclePosition.vehicle_id == str(vehicle.vehicle.id),
                VehiclePosition.timestamp == timestamp,
            )
            .first()
        )

        if existing_position:
            logger.debug(
                f"Skipping duplicate vehicle position for vehicle {vehicle.vehicle.id} at {timestamp}"
            )
            return True
        return False

    def _create_vehicle_position(
        self, vehicle: Message, timestamp: datetime, agency_id: str
    ) -> VehiclePosition:
        """Create VehiclePosition object from GTFS vehicle data."""
        return VehiclePosition(
            vehicle_id=str(vehicle.vehicle.id),
            trip_id=str(vehicle.trip.trip_id) if vehicle.HasField("trip") else None,
            route_id=str(vehicle.trip.route_id) if vehicle.HasField("trip") else None,
            latitude=float(vehicle.position.latitude),
            longitude=float(vehicle.position.longitude),
            bearing=(
                float(vehicle.position.bearing)
                if vehicle.position.HasField("bearing")
                else None
            ),
            speed=(
                float(vehicle.position.speed)
                if vehicle.position.HasField("speed")
                else None
            ),
            stop_id=str(vehicle.stop_id) if vehicle.HasField("stop_id") else None,
            current_status=(
                self.VehicleStopStatus.Name(vehicle.current_status)
                if vehicle.HasField("current_status")
                else None
            ),
            timestamp=timestamp,
            current_stop_sequence=(
                int(vehicle.current_stop_sequence)
                if vehicle.HasField("current_stop_sequence")
                else None
            ),
            congestion_level=(
                self.CongestionLevel.Name(vehicle.congestion_level)
                if vehicle.HasField("congestion_level")
                else None
            ),
            occupancy_status=(
                self.OccupancyStatus.Name(vehicle.occupancy_status)
                if vehicle.HasField("occupancy_status")
                else None
            ),
            agency_id=agency_id,
        )

    def _save_position(self, position: VehiclePosition) -> bool:
        """Save vehicle position to database. Returns success status."""
        try:
            self.db.add(position)
            self.db.commit()
            return True
        except Exception as commit_error:
            logger.error(f"Error committing vehicle position: {str(commit_error)}")
            self.db.rollback()
            return False


# def fetch_realtime_trip_updates(db: Session, agency_id: str):
#     """Fetch and store realtime trip updates for an agency"""
#     try:
#         agency = db.query(Agency).filter(Agency.id == agency_id).first()
#         if not agency or not agency.realtime_trip_updates_url:
#             raise Exception(f"Agency {agency_id} not found or missing trip updates URL")

#         logger.info(f"Fetching realtime trip updates for agency {agency_id}")
#         response = requests.get(agency.realtime_trip_updates_url, timeout=30)
#         response.raise_for_status()

#         feed = gtfs_realtime_pb2.FeedMessage()
#         feed.ParseFromString(response.content)

#         current_time = datetime.now()
#         updates_count = 0

#         for entity in feed.entity:
#             if entity.HasField("trip_update"):
#                 trip_update = entity.trip_update
#                 for stop_time_update in trip_update.stop_time_update:
#                     try:
#                         db_update = RealtimeTripUpdate(
#                             trip_id=str(trip_update.trip.trip_id),
#                             stop_id=str(stop_time_update.stop_id),
#                             arrival_delay=(
#                                 stop_time_update.arrival.delay
#                                 if stop_time_update.HasField("arrival")
#                                 else None
#                             ),
#                             departure_delay=(
#                                 stop_time_update.departure.delay
#                                 if stop_time_update.HasField("departure")
#                                 else None
#                             ),
#                             timestamp=current_time,
#                             vehicle_id=(
#                                 trip_update.vehicle.id
#                                 if trip_update.HasField("vehicle")
#                                 else None
#                             ),
#                             current_status=(
#                                 trip_update.trip.schedule_relationship.name
#                                 if trip_update.trip.HasField("schedule_relationship")
#                                 else None
#                             ),
#                             schedule_relationship=(
#                                 trip_update.trip.schedule_relationship.name
#                                 if trip_update.trip.HasField("schedule_relationship")
#                                 else None
#                             ),
#                         )
#                         db.add(db_update)
#                         updates_count += 1
#                     except ValueError as e:
#                         logger.error(f"Error processing trip update: {str(e)}")
#                         continue


#         db.commit()
#         logger.info(
#             f"Trip updates loaded successfully: {updates_count} updates processed"
#         )
#     except requests.RequestException as e:
#         raise Exception(f"Error fetching trip updates: {str(e)}")
#     except Exception as e:
#         db.rollback()
#         raise Exception(f"Error processing trip updates: {str(e)}")


# def fetch_service_alerts(db: Session, agency_id: str):
#     """Fetch and store service alerts for an agency"""
#     try:
#         agency = db.query(Agency).filter(Agency.id == agency_id).first()
#         if not agency or not agency.realtime_service_alerts_url:
#             raise Exception(
#                 f"Agency {agency_id} not found or missing service alerts URL"
#             )

#         logger.info(f"Fetching service alerts for agency {agency_id}")
#         response = requests.get(agency.realtime_service_alerts_url, timeout=30)
#         response.raise_for_status()

#         feed = gtfs_realtime_pb2.FeedMessage()
#         feed.ParseFromString(response.content)

#         alerts_count = 0
#         current_time = datetime.now()

#         # First, mark all existing alerts as inactive
#         db.query(ServiceAlert).filter(
#             ServiceAlert.agency_id == agency_id, ServiceAlert.active == True
#         ).update({"active": False})

#         for entity in feed.entity:
#             if entity.HasField("alert"):
#                 alert = entity.alert
#                 try:
#                     db_alert = ServiceAlert(
#                         alert_id=str(entity.id),
#                         agency_id=agency_id,
#                         cause=alert.cause.name if alert.HasField("cause") else None,
#                         effect=alert.effect.name if alert.HasField("effect") else None,
#                         header_text=(
#                             alert.header_text.translation[0].text
#                             if alert.header_text.translation
#                             else None
#                         ),
#                         description_text=(
#                             alert.description_text.translation[0].text
#                             if alert.description_text.translation
#                             else None
#                         ),
#                         url=(
#                             alert.url.translation[0].text
#                             if alert.url.translation
#                             else None
#                         ),
#                         timestamp=current_time,
#                         start_time=(
#                             datetime.fromtimestamp(alert.active_period[0].start)
#                             if alert.active_period
#                             and alert.active_period[0].HasField("start")
#                             else None
#                         ),
#                         end_time=(
#                             datetime.fromtimestamp(alert.active_period[0].end)
#                             if alert.active_period
#                             and alert.active_period[0].HasField("end")
#                             else None
#                         ),
#                         severity_level=(
#                             alert.severity_level.name
#                             if alert.HasField("severity_level")
#                             else None
#                         ),
#                         active=True,
#                     )
#                     db.add(db_alert)
#                     db.flush()  # Flush to get the alert ID

#                     # Add affected entities
#                     for informed_entity in alert.informed_entity:
#                         if informed_entity.HasField("route_id"):
#                             db_entity = AlertEntity(
#                                 alert_id=db_alert.id,
#                                 entity_type="route",
#                                 entity_id=str(informed_entity.route_id),
#                             )
#                             db.add(db_entity)
#                         elif informed_entity.HasField("trip"):
#                             db_entity = AlertEntity(
#                                 alert_id=db_alert.id,
#                                 entity_type="trip",
#                                 entity_id=str(informed_entity.trip.trip_id),
#                             )
#                             db.add(db_entity)
#                         elif informed_entity.HasField("stop_id"):
#                             db_entity = AlertEntity(
#                                 alert_id=db_alert.id,
#                                 entity_type="stop",
#                                 entity_id=str(informed_entity.stop_id),
#                             )
#                             db.add(db_entity)
#                         elif informed_entity.HasField("agency_id"):
#                             db_entity = AlertEntity(
#                                 alert_id=db_alert.id,
#                                 entity_type="agency",
#                                 entity_id=str(informed_entity.agency_id),
#                             )
#                             db.add(db_entity)

#                     alerts_count += 1
#                 except ValueError as e:
#                     logger.error(f"Error processing service alert: {str(e)}")
#                     continue

#         db.commit()
#         logger.info(
#             f"Service alerts loaded successfully: {alerts_count} alerts processed"
#         )
#     except requests.RequestException as e:
#         raise Exception(f"Error fetching service alerts: {str(e)}")
#     except Exception as e:
#         db.rollback()
#         raise Exception(f"Error processing service alerts: {str(e)}")


# def fetch_all_realtime_data(db: Session, agency_id: str):
#     """Fetch all types of realtime data for an agency"""
#     try:
#         fetch_realtime_trip_updates(db, agency_id)
#         fetch_vehicle_positions(db, agency_id)
#         fetch_service_alerts(db, agency_id)
#     except Exception as e:
#         logger.error(f"Error fetching realtime data for agency {agency_id}: {str(e)}")
#         raise
