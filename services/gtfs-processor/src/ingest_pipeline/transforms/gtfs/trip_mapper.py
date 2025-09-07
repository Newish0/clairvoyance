from typing import AsyncIterator, Dict, Any
from models.mongo_schemas import Trip
from pymongo import UpdateOne
from ingest_pipeline.core.types import Transformer


class TripMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS trips.txt rows (dict) into MongoDB UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: pymongo UpdateOne
    """

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def transform(
        self, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            trip_doc = Trip(
                agency_id=self.agency_id,
                trip_id=row["trip_id"],
                route_id=row["route_id"],
                service_id=row["service_id"],
                trip_headsign=row["trip_headsign"],
                trip_short_name=row["trip_short_name"],
                direction_id=row["direction_id"],
                block_id=row["block_id"],
                shape_id=row["shape_id"],
            )
            
            
            
            update = UpdateOne(
                {"agency_id": self.agency_id, "trip_id": trip_doc.trip_id},
                {"$set": trip_doc.model_dump()},
                upsert=True,
            )
            yield update
