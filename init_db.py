import logging
from database import SessionLocal, engine
import gtfs_loader
import models



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create database tables
models.Base.metadata.create_all(bind=engine)


db = SessionLocal()
# Load agencies from agencies.json
gtfs_loader.load_agencies(db)

# Load GTFS data for BC Transit Victoria
gtfs_loader.download_and_load_static_gtfs(db, "bct-vic")
