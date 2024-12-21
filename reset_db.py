from database import engine
import models
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def reset_database():
    """Reset the database by dropping and recreating all tables."""
    try:
        logger.info("Dropping all tables...")
        models.Base.metadata.drop_all(bind=engine)
        logger.info("Creating all tables...")
        models.Base.metadata.create_all(bind=engine)
        logger.info("Database reset complete.")
    except Exception as e:
        logger.error(f"Error resetting database: {str(e)}")
        raise

if __name__ == "__main__":
    try:
        reset_database()
    except Exception as e:
        logger.error(f"Failed to reset database: {str(e)}")
        exit(1) 