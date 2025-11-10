from typing import AsyncIterator, Dict
from ingest_pipeline.core.errors import ErrorPolicy
from models.enums import RouteType
from models.mongo_schemas import Route
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer


class RouteMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS routes.txt rows (dict) into Mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: Mongo UpdateOne
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpdateOne] = UpdateOne

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
        None: None,
    }

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in inputs:
            try:
                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the model immediately after.
                route_doc = Route(
                    agency_id=self.agency_id,
                    route_id=row.get("route_id"),  # type: ignore
                    route_short_name=row.get("route_short_name"),
                    route_long_name=row.get("route_long_name"),
                    route_type=self.__ROUTE_TYPE_MAPPING.get(row.get("route_type")),  # type: ignore
                    route_color=row.get("route_color"),
                    route_text_color=row.get("route_text_color"),
                )

                await route_doc.validate_self()

                yield UpdateOne(
                    {"agency_id": self.agency_id, "route_id": route_doc.route_id},
                    {"$set": route_doc.model_dump(exclude={"id"})},
                    upsert=True,
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("route_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
