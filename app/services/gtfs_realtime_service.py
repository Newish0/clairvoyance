from operator import and_
import threading
import requests
from sqlalchemy.orm import Session
from google.transit import gtfs_realtime_pb2
from google.protobuf.message import Message
from typing import Optional, Tuple, List
from datetime import datetime, timedelta
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
                success_count, total_count = self.fetch_vehicle_positions(agency_id)
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


class TripUpdateFetcher:
    def __init__(self, db: Session, retention_period: int = 24):
        """
        Initialize TripUpdateFetcher

        Args:
            db: Database session
            retention_period: Hours to keep trip updates (default 24)
        """
        self.db = db
        self.retention_period = retention_period
        self._stop_event = threading.Event()
        self._background_thread: Optional[threading.Thread] = None

    def start_background_fetch(
        self, agency_id: str, polling_interval: int = 30
    ) -> None:
        """Start background fetching for the specified agency."""
        if self._background_thread and self._background_thread.is_alive():
            raise RuntimeError("Background fetch already running")

        self._stop_event.clear()
        self._background_thread = threading.Thread(
            target=self._background_fetch_loop,
            args=(agency_id, polling_interval),
            daemon=True,
        )
        self._background_thread.start()
        logger.info(f"Started background trip updates fetching for agency {agency_id}")

    def stop_background_fetch(self) -> None:
        """Stop background fetching."""
        if self._background_thread:
            self._stop_event.set()
            self._background_thread.join()
            logger.info("Stopped background trip updates fetching")

    def join_background_fetch(self) -> None:
        """Wait for background fetch to complete."""
        if self._background_thread:
            self._background_thread.join()

    def _background_fetch_loop(
        self, agency_id: str, polling_interval: int, auto_cleanup=False
    ) -> None:
        """Background loop for fetching trip updates."""
        while not self._stop_event.is_set():
            try:
                success_count, total_count = self.fetch_trip_updates(agency_id)
                if auto_cleanup:
                    self.cleanup_old_updates()
                logger.info(
                    f"Background fetch completed: {success_count}/{total_count} trip updates processed"
                )
            except Exception as e:
                logger.error(f"Error in background fetch: {str(e)}")

            self._stop_event.wait(polling_interval)

    def cleanup_old_updates(self) -> None:
        """Remove trip updates older than retention period."""
        try:
            cutoff_time = datetime.now() - timedelta(hours=self.retention_period)
            self.db.query(RealtimeTripUpdate).filter(
                RealtimeTripUpdate.timestamp < cutoff_time
            ).delete()
            self.db.commit()
        except Exception as e:
            logger.error(f"Error cleaning up old updates: {str(e)}")
            self.db.rollback()

    def fetch_trip_updates(self, agency_id: str) -> Tuple[int, int]:
        """
        Fetch and store realtime trip updates for an agency.
        Returns tuple of (success_count, total_updates_count)
        """
        agency = self._get_agency(agency_id)
        feed = self._fetch_gtfs_feed(agency.realtime_trip_updates_url)
        return self._process_feed(feed)

    def _get_agency(self, agency_id: str) -> Agency:
        """Fetch agency from database and validate it has required URL."""
        agency = self.db.query(Agency).filter(Agency.id == agency_id).first()
        if not agency or not agency.realtime_trip_updates_url:
            raise Exception(f"Agency {agency_id} not found or missing trip updates URL")
        return agency

    def _fetch_gtfs_feed(self, url: str) -> gtfs_realtime_pb2.FeedMessage:
        """Fetch and parse GTFS realtime feed from URL."""
        try:
            logger.info(f"Fetching trip updates from {url}")
            response = requests.get(url, timeout=30)
            response.raise_for_status()

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)
            return feed
        except requests.RequestException as e:
            raise Exception(f"Error fetching trip updates: {str(e)}")

    def _process_feed(self, feed: gtfs_realtime_pb2.FeedMessage) -> Tuple[int, int]:
        """Process GTFS feed and store trip updates."""
        updates_count = success_count = 0
        current_time = datetime.now()

        # Start transaction
        try:
            for entity in feed.entity:
                if not entity.HasField("trip_update"):
                    continue

                try:
                    if self._process_trip_update(entity.trip_update, current_time):
                        success_count += 1
                    updates_count += 1
                except ValueError as e:
                    logger.error(f"Error processing trip update: {str(e)}")
                    continue

            self.db.commit()
            logger.info(
                f"Trip updates loaded successfully: {success_count}/{updates_count} updates processed"
            )
            return success_count, updates_count
        except Exception as e:
            self.db.rollback()
            raise e

    def _process_trip_update(
        self, trip_update: Message, current_time: datetime
    ) -> bool:
        """Process single trip update and store in database. Returns success status."""
        timestamp = self._get_update_timestamp(trip_update, current_time)

        for stop_time_update in trip_update.stop_time_update:
            new_update = self._create_trip_update(
                trip_update, stop_time_update, timestamp
            )
            if not self._save_update(new_update):
                return False
        return True

    def _get_update_timestamp(
        self, trip_update: Message, current_time: datetime
    ) -> datetime:
        """Get timestamp for trip update."""
        return (
            datetime.fromtimestamp(trip_update.timestamp)
            if trip_update.HasField("timestamp")
            else current_time
        )
    
    @staticmethod
    def _extract_core_trip_id(trip_id: str) -> str:
        """
        Extracts the core trip ID by removing the part after the '#' symbol (if it exists).
        
        :param trip_id: The full trip ID, possibly containing a '#' and an update identifier.
        :return: The core trip ID, without the '#<update_id>' part.
        """
        if '#' in trip_id:
            return trip_id.split('#')[0]  # Split at '#' and return the first part (the core trip ID)
        return trip_id  # If no '#' exists, return the original trip ID as it is.

    def _create_trip_update(
        self, trip_update: Message, stop_time_update: Message, timestamp: datetime
    ) -> RealtimeTripUpdate:
        """Create RealtimeTripUpdate object from GTFS trip update data."""
    
        # We ignore the `#` since we use unique ID attribute 
        # in DB to store the same trip but with updated info.
        core_trip_id = self._extract_core_trip_id(trip_update.trip.trip_id)
        
        return RealtimeTripUpdate(
            trip_id=str(core_trip_id),
            stop_id=str(stop_time_update.stop_id),
            arrival_delay=(
                int(stop_time_update.arrival.delay)
                if stop_time_update.HasField("arrival")
                else None
            ),
            departure_delay=(
                int(stop_time_update.departure.delay)
                if stop_time_update.HasField("departure")
                else None
            ),
            timestamp=timestamp,
            vehicle_id=(
                str(trip_update.vehicle.id) if trip_update.HasField("vehicle") else None
            ),
            current_status=(
                trip_update.trip.schedule_relationship
                if trip_update.trip.HasField("schedule_relationship")
                else None
            ),
            schedule_relationship=(
                stop_time_update.schedule_relationship
                if stop_time_update.HasField("schedule_relationship")
                else None
            ),
        )

    def _save_update(self, new_update: RealtimeTripUpdate) -> bool:
        """Save trip update to database if it represents new information."""
        try:
            # Check for existing update with same trip_id and stop_id
            existing_update = (
                self.db.query(RealtimeTripUpdate)
                .filter(
                    and_(
                        RealtimeTripUpdate.trip_id == new_update.trip_id,
                        RealtimeTripUpdate.stop_id == new_update.stop_id,
                    )
                )
                .order_by(RealtimeTripUpdate.timestamp.desc())
                .first()
            )

            # Only save if there's no existing update or if the information has changed
            if not existing_update or self._has_relevant_changes(
                existing_update, new_update
            ):
                self.db.add(new_update)
                return True
            return True  # Still return True as this is not an error case
        except Exception as error:
            logger.error(f"Error saving trip update: {str(error)}")
            return False

    def _has_relevant_changes(
        self, existing: RealtimeTripUpdate, new: RealtimeTripUpdate
    ) -> bool:
        """Check if new update has relevant changes compared to existing one."""
        return (
            existing.arrival_delay != new.arrival_delay
            or existing.departure_delay != new.departure_delay
            or existing.current_status != new.current_status
            or existing.schedule_relationship != new.schedule_relationship
        )
