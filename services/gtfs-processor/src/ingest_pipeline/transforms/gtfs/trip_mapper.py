from typing import AsyncIterator, Dict, Any
from models.enums import Direction
from models.mongo_schemas import Trip
from pymongo import UpdateOne
from ingest_pipeline.core.types import Transformer


class TripMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS trips.txt rows (dict) into MongoDB UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: pymongo UpdateOne
    """

    __DIRECTION_ID_MAPPING = {
        "0": Direction.OUTBOUND,
        "1": Direction.INBOUND,
    }

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            trip_doc = Trip(
                agency_id=self.agency_id,
                trip_id=row.get("trip_id"),
                route_id=row.get("route_id"),
                service_id=row.get("service_id"),
                trip_headsign=row.get("trip_headsign"),
                trip_short_name=row.get("trip_short_name"),
                direction_id=self.__DIRECTION_ID_MAPPING.get(row.get("direction_id")),
                block_id=row.get("block_id"),
                shape_id=row.get("shape_id"),
            )

            update = UpdateOne(
                {"agency_id": self.agency_id, "trip_id": trip_doc.trip_id},
                {"$set": trip_doc.model_dump()},
                upsert=True,
            )
            yield update
