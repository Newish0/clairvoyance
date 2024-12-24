import os
import sys

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


from app.core.database import SessionLocal, engine
from app.models.models import Agency, Base
from app.services.gtfs_realtime_service import (
    VehiclePositionFetcher,
)


def main():
    # Create a new session
    db = SessionLocal()

    vehicle_pos_fetcher = VehiclePositionFetcher(
        db,
    )

    # vehicle_pos_fetcher.fetch_vehicle_positions("bct-vic")
    
    vehicle_pos_fetcher.start_background_fetch("bct-vic", 1)
    vehicle_pos_fetcher.join_background_fetch()


if __name__ == "__main__":
    main()
