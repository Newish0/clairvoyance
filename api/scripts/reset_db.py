import sys
import os

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


import logging
from sqlalchemy import text

from app.core.database import engine, SessionLocal
from app.models.models import Base


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def reset_db():
    """
    Drop all tables and recreate them.
    WARNING: This will delete all data in the database!
    """
    try:
        # Drop all tables
        Base.metadata.drop_all(bind=engine)
        logger.info("All tables dropped successfully")

        # Recreate all tables
        Base.metadata.create_all(bind=engine)
        logger.info("All tables recreated successfully")

    except Exception as e:
        logger.error(f"Error resetting database: {str(e)}")
        raise

if __name__ == "__main__":
    reset_db() 