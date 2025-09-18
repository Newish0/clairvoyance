from typing import AsyncIterator, Dict
from ingest_pipeline.core.errors import ErrorPolicy
from models.enums import Direction
from models.mongo_schemas import Trip
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer


class TripMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS trips.txt rows (dict) into MongoDB UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: pymongo UpdateOne
    """

    __DIRECTION_ID_MAPPING = {
        "0": Direction.OUTBOUND,
        "1": Direction.INBOUND,
        None: None,
    }

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in inputs:
            try:
                trip_doc = Trip(
                    agency_id=self.agency_id,
                    trip_id=row.get("trip_id"),
                    route_id=row.get("route_id"),
                    service_id=row.get("service_id"),
                    trip_headsign=row.get("trip_headsign"),
                    trip_short_name=row.get("trip_short_name"),
                    direction_id=self.__DIRECTION_ID_MAPPING.get(
                        row.get("direction_id")
                    ),
                    block_id=row.get("block_id"),
                    shape_id=row.get("shape_id"),
                )

                await trip_doc.validate_self()

                update = UpdateOne(
                    {"agency_id": self.agency_id, "trip_id": trip_doc.trip_id},
                    {"$set": trip_doc.model_dump()},
                    upsert=True,
                )
                yield update
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("trip_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
