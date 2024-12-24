from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import logging

from app.core.database import get_db
from app.models.models import Agency, Route, Trip

from app.api.schemas import AgencyResponse, RouteResponse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", tags=["root"])
def read_root():
    return {"message": "Welcome to GTFS API", "version": "1.0.0"}


@router.get("/agencies", response_model=List[AgencyResponse], tags=["agencies"])
def get_agencies(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    """
    Get all transit agencies with pagination support.
    """
    try:
        agencies = db.query(Agency).offset(skip).limit(limit).all()
        return agencies
    except Exception as e:
        logger.error(f"Error fetching agencies: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/agencies/{agency_id}", response_model=AgencyResponse, tags=["agencies"])
def get_agency(agency_id: str, db: Session = Depends(get_db)):
    """
    Get details for a specific transit agency.
    """
    try:
        agency = db.query(Agency).filter(Agency.id == agency_id).first()
        if agency is None:
            raise HTTPException(status_code=404, detail="Agency not found")
        return agency
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agency {agency_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/agencies/{agency_id}/routes", response_model=List[RouteResponse], tags=["routes"]
)
def get_agency_routes(
    agency_id: str,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    """
    Get routes for a specific transit agency with pagination support.
    """
    try:
        routes = (
            db.query(Route)
            .filter(Route.agency_id == agency_id)
            .offset(skip)
            .limit(limit)
            .all()
        )
        if not routes:
            raise HTTPException(
                status_code=404, detail="No routes found for this agency"
            )
        return routes
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching routes for agency {agency_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


# @router.get(
#     "/realtime/{agency_id}",
#     response_model=List[RealtimeUpdateResponse],
#     tags=["realtime"],
# )
# def get_realtime_updates(
#     agency_id: str,
#     db: Session = Depends(get_db),
#     skip: int = Query(0, ge=0),
#     limit: int = Query(100, ge=1, le=1000),
# ):
#     """
#     Get realtime updates for a specific transit agency with pagination support.
#     """
#     try:
#         # First check if agency exists
#         agency = db.query(Agency).filter(Agency.id == agency_id).first()
#         if not agency:
#             raise HTTPException(status_code=404, detail="Agency not found")

#         updates = (
#             db.query(RealtimeUpdate)
#             .join(Trip)
#             .join(Route)
#             .filter(Route.agency_id == agency_id)
#             .order_by(RealtimeUpdate.timestamp.desc())
#             .offset(skip)
#             .limit(limit)
#             .all()
#         )

#         if not updates:
#             raise HTTPException(
#                 status_code=404, detail="No realtime updates found for this agency"
#             )

#         return updates
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(
#             f"Error fetching realtime updates for agency {agency_id}: {str(e)}"
#         )
#         raise HTTPException(status_code=500, detail="Internal server error")


# @router.post("/agencies/{agency_id}/load-static", tags=["data-loading"])
# def load_static_data(agency_id: str, db: Session = Depends(get_db)):
#     """
#     Trigger loading of static GTFS data for a specific agency.
#     """
#     try:
#         download_and_load_static_gtfs(db, agency_id)
#         return {"message": f"Static GTFS data loaded successfully for agency {agency_id}"}
#     except Exception as e:
#         logger.error(f"Error loading static data for agency {agency_id}: {str(e)}")
#         raise HTTPException(status_code=500, detail=str(e))

# @router.post("/agencies/{agency_id}/load-realtime", tags=["data-loading"])
# def load_realtime_data(agency_id: str, db: Session = Depends(get_db)):
#     """
#     Trigger loading of realtime GTFS data for a specific agency.
#     """
#     try:
#         fetch_realtime_updates(db, agency_id)
#         return {"message": f"Realtime GTFS data loaded successfully for agency {agency_id}"}
#     except Exception as e:
#         logger.error(f"Error loading realtime data for agency {agency_id}: {str(e)}")
#         raise HTTPException(status_code=500, detail=str(e))
