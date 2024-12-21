import json
import os
from typing import List, Optional
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
import logging

import models
from database import SessionLocal, engine, get_db
from gtfs_loader import load_agencies, download_and_load_static_gtfs, fetch_realtime_updates

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="GTFS API",
    description="API for GTFS static and realtime data",
    version="1.0.0"
)

class AgencyResponse(BaseModel):
    id: str
    name: str
    static_gtfs_url: str
    realtime_gtfs_url: str

    class Config:
        from_attributes = True

class RouteResponse(BaseModel):
    id: str
    agency_id: str
    route_short_name: str
    route_long_name: str
    route_type: int

    class Config:
        from_attributes = True

class RealtimeUpdateResponse(BaseModel):
    trip_id: str
    stop_id: int
    arrival_delay: Optional[int]
    departure_delay: Optional[int]
    timestamp: datetime
    vehicle_id: Optional[str]
    current_status: Optional[str]

    class Config:
        from_attributes = True

@app.get("/")
def read_root():
    return {"message": "Welcome to GTFS API", "version": "1.0.0"}

@app.get("/agencies", response_model=List[AgencyResponse])
def get_agencies(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
):
    """
    Get all transit agencies with pagination support.
    """
    try:
        agencies = db.query(models.Agency).offset(skip).limit(limit).all()
        return agencies
    except Exception as e:
        logger.error(f"Error fetching agencies: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/agencies/{agency_id}", response_model=AgencyResponse)
def get_agency(agency_id: str, db: Session = Depends(get_db)):
    """
    Get details for a specific transit agency.
    """
    try:
        agency = db.query(models.Agency).filter(models.Agency.id == agency_id).first()
        if agency is None:
            raise HTTPException(status_code=404, detail="Agency not found")
        return agency
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agency {agency_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/agencies/{agency_id}/routes", response_model=List[RouteResponse])
def get_agency_routes(
    agency_id: str,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
):
    """
    Get routes for a specific transit agency with pagination support.
    """
    try:
        routes = db.query(models.Route)\
            .filter(models.Route.agency_id == agency_id)\
            .offset(skip)\
            .limit(limit)\
            .all()
        if not routes:
            raise HTTPException(status_code=404, detail="No routes found for this agency")
        return routes
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching routes for agency {agency_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/realtime/{agency_id}", response_model=List[RealtimeUpdateResponse])
def get_realtime_updates(
    agency_id: str,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
):
    """
    Get realtime updates for a specific transit agency with pagination support.
    """
    try:
        # First check if agency exists
        agency = db.query(models.Agency).filter(models.Agency.id == agency_id).first()
        if not agency:
            raise HTTPException(status_code=404, detail="Agency not found")

        updates = db.query(models.RealtimeUpdate)\
            .join(models.Trip)\
            .join(models.Route)\
            .filter(models.Route.agency_id == agency_id)\
            .order_by(models.RealtimeUpdate.timestamp.desc())\
            .offset(skip)\
            .limit(limit)\
            .all()
        
        if not updates:
            raise HTTPException(status_code=404, detail="No realtime updates found for this agency")
        
        return updates
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching realtime updates for agency {agency_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/agencies/{agency_id}/load-static")
def load_static_data(agency_id: str, db: Session = Depends(get_db)):
    """
    Trigger loading of static GTFS data for a specific agency.
    """
    try:
        download_and_load_static_gtfs(db, agency_id)
        return {"message": f"Static GTFS data loaded successfully for agency {agency_id}"}
    except Exception as e:
        logger.error(f"Error loading static data for agency {agency_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agencies/{agency_id}/load-realtime")
def load_realtime_data(agency_id: str, db: Session = Depends(get_db)):
    """
    Trigger loading of realtime GTFS data for a specific agency.
    """
    try:
        fetch_realtime_updates(db, agency_id)
        return {"message": f"Realtime GTFS data loaded successfully for agency {agency_id}"}
    except Exception as e:
        logger.error(f"Error loading realtime data for agency {agency_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 