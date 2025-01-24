import os
import sys
from time import sleep

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


from scripts.init_db import init_db
from app.core.database import SessionLocal, engine
from app.models.models import Agency, Base
from app.services.gtfs_realtime_service import (
    TripUpdateFetcher,
    VehiclePositionFetcher,
)


def main():
    init_db() # Ensure the database tables have been created. 
    
    # Create a new session
    db = SessionLocal()

    # For performance reason, we are limit to storing 12 hours of historical data.
    vehicle_pos_fetcher = VehiclePositionFetcher(db, retention_period=12)
    trip_update_fetcher = TripUpdateFetcher(db, retention_period=12)

    while True:
        vehicle_pos_fetcher.cleanup_old_updates()
        trip_update_fetcher.cleanup_old_updates()

        try:
            vehicle_pos_fetcher.fetch_vehicle_positions("bct-vic")
        except: 
            pass
        
        try:
            trip_update_fetcher.fetch_trip_updates("bct-vic")
        except: 
            pass
        
        sleep(30)


if __name__ == "__main__":
    main()
