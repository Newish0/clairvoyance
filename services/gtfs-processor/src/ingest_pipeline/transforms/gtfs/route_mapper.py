from typing import AsyncIterator, Dict
from models.enums import RouteType
from models.mongo_schemas import Route
from pymongo import UpdateOne
from ingest_pipeline.core.types import Transformer
from beanie.odm.operators.update.general import Set


class RouteMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS routes.txt rows (dict) into Mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: Mongo UpdateOne
    """

    __ROUTE_TYPE_MAPPING = {
        "0": RouteType.TRAM,
        "1": RouteType.SUBWAY,
        "2": RouteType.RAIL,
        "3": RouteType.BUS,
        "4": RouteType.FERRY,
        "5": RouteType.CABLE_TRAM,
        "6": RouteType.AERIAL_LIFT,
        "7": RouteType.FUNICULAR,
        "11": RouteType.TROLLEYBUS,
        "12": RouteType.MONORAIL,
    }

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            route_doc = Route(
                agency_id=self.agency_id,
                route_id=row.get("route_id"),
                route_short_name=row.get("route_short_name"),
                route_long_name=row.get("route_long_name"),
                route_type=self.__ROUTE_TYPE_MAPPING.get(row.get("route_type")),
                route_color=row.get("route_color"),
                route_text_color=row.get("route_text_color"),
            )

            yield UpdateOne(
                {"agency_id": self.agency_id, "route_id": route_doc.route_id},
                {"$set": route_doc.model_dump(exclude={"id"})},
                upsert=True,
            )
