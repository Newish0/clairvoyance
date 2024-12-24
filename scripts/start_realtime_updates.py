import os
import sys

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


from app.core.database import SessionLocal, engine
from app.models.models import Agency, Base
from app.services.gtfs_realtime_service import (
    TripUpdateFetcher,
    VehiclePositionFetcher,
)


def main():
    # Create a new session
    db = SessionLocal()

    vehicle_pos_fetcher = VehiclePositionFetcher(
        db,
    )

    trip_update_fetcher = TripUpdateFetcher(db)

    # vehicle_pos_fetcher.fetch_vehicle_positions("bct-vic")

    vehicle_pos_fetcher.start_background_fetch("bct-vic", 30)
    
    trip_update_fetcher.start_background_fetch("bct-vic")
    
    vehicle_pos_fetcher.join_background_fetch()


if __name__ == "__main__":
    main()
