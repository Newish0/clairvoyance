import os
import sys

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.services.gtfs_static_service import GTFSLoader


def init_gtfs():
    # Create a new session
    db = SessionLocal()
    
    loader = GTFSLoader(db, batch_size=1000)

    try:
        # Load agencies from JSON file
        agencies_file = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "data", "agencies.json"
        )
        if os.path.exists(agencies_file):
            loader.load_agencies(agencies_file)
            print("Agencies loaded successfully")
        else:
            print(f"Warning: {agencies_file} not found")
            
            
        loader.download_and_load_static_gtfs("bct-vic") # HACK: Hard coded agency ID for now
    finally:
        db.close()


if __name__ == "__main__":
    init_gtfs()
