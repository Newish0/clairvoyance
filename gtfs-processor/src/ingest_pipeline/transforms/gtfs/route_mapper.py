from typing import AsyncIterator, Dict

from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation
from generated.db_models import Routes


class RouteMapper(Transformer[Dict[str, str], UpsertOperation]):
    """
    Maps GTFS routes.txt rows (dict) into UpsertOperations for the
    relational `Routes` table.

    Input: Dict[str, str]
    Output: UpsertOperation
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpsertOperation] = UpsertOperation

    __ROUTE_TYPE_MAPPING = {
        "0": "TRAM",
        "1": "SUBWAY",
        "2": "RAIL",
        "3": "BUS",
        "4": "FERRY",
        "5": "CABLE_TRAM",
        "6": "AERIAL_LIFT",
        "7": "FUNICULAR",
        "11": "TROLLEYBUS",
        "12": "MONORAIL",
        None: None,
    }

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpsertOperation]:
        async for row in inputs:
            try:
                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the model immediately after.
                route_model = Routes(
                    agency_id=self.agency_id,
                    route_sid=row.get("route_id"),  # type: ignore
                    type=self.__ROUTE_TYPE_MAPPING.get(row.get("route_type")),  # type: ignore
                    short_name=row.get("route_short_name"),
                    long_name=row.get("route_long_name"),
                    color=row.get("route_color"),
                    text_color=row.get("route_text_color"),
                )

                yield UpsertOperation(
                    model=Routes,
                    values=route_model.model_dump(),
                    conflict_columns=["agency_id", "route_sid"],
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
