import os
import sys

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


import os


from app.core.database import SessionLocal, engine
from app.models.models import Agency, Base
from app.services.gtfs_static_service import download_and_load_static_gtfs, load_agencies


def init_db():
    # Create tables
    Base.metadata.create_all(bind=engine)

    # Create a new session
    db = SessionLocal()
    try:
        # Load agencies from JSON file
        agencies_file = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "data", "agencies.json"
        )
        if os.path.exists(agencies_file):
            load_agencies(db, agencies_file)
            print("Agencies loaded successfully")
        else:
            print(f"Warning: {agencies_file} not found")
            
        download_and_load_static_gtfs(db, "bct-vic") # HACK: Hard coded agency ID for now
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
