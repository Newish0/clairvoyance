from sqlalchemy.orm import Session
import logging
from typing import List

from app.models.models import Agency
from app.api.schemas import AgencyResponse

logger = logging.getLogger(__name__)

def get_agencies(db: Session, skip: int = 0, limit: int = 100) -> List[AgencyResponse]:
    """Get all transit agencies with pagination support."""
    try:
        return db.query(Agency).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"Error fetching agencies: {str(e)}")
        raise

def get_agency_by_id(db: Session, agency_id: str) -> AgencyResponse:
    """Get details for a specific transit agency."""
    try:
        agency = db.query(Agency).filter(Agency.id == agency_id).first()
        if not agency:
            return None
        return agency
    except Exception as e:
        logger.error(f"Error fetching agency {agency_id}: {str(e)}")
        raise 