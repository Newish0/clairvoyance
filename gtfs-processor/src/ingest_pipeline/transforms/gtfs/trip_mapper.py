from typing import AsyncIterator, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from generated.db_models import Routes, Shapes, Trips
from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation
from database.database_manager import DatabaseManager


class TripMapper(Transformer[Dict[str, str], UpsertOperation]):
    """
    Maps GTFS trips.txt rows (dict) into UpsertOperations for the
    relational `Trips` table. Resolves foreign key relationships for
    route_id and shape_id.

    Input: Dict[str, str]
    Output: UpsertOperation
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpsertOperation] = UpsertOperation

    __DIRECTION_ID_MAPPING = {
        "0": "OUTBOUND",
        "1": "INBOUND",
        None: None,
    }

    def __init__(self, agency_id: str, db: DatabaseManager):
        self.agency_id = agency_id
        self.db = db
        # Cache for FK lookups
        self._route_cache: Dict[str, Optional[int]] = {}
        self._shape_cache: Dict[str, Optional[int]] = {}

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpsertOperation]:
        async for row in inputs:
            try:
                route_sid = row.get("route_id")
                shape_sid = row.get("shape_id")

                # Lookup route_id if needed
                route_id = None
                if route_sid:
                    if route_sid not in self._route_cache:
                        route_id = await self._lookup_route(context, route_sid)
                        self._route_cache[route_sid] = route_id
                    else:
                        route_id = self._route_cache[route_sid]

                # Lookup shape_id if needed
                shape_id = None
                if shape_sid:
                    if shape_sid not in self._shape_cache:
                        shape_id = await self._lookup_shape(context, shape_sid)
                        self._shape_cache[shape_sid] = shape_id
                    else:
                        shape_id = self._shape_cache[shape_sid]

                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the model immediately after.
                trip_model = Trips(
                    agency_id=self.agency_id,
                    trip_sid=row.get("trip_id"),  # type: ignore
                    service_sid=row.get("service_id"),  # type: ignore
                    route_id=route_id,
                    shape_id=shape_id,
                    headsign=row.get("trip_headsign"),
                    short_name=row.get("trip_short_name"),
                    direction=self.__DIRECTION_ID_MAPPING.get(row.get("direction_id")),
                    block_id=row.get("block_id"),
                )

                yield UpsertOperation(
                    model=Trips,
                    values=trip_model.model_dump(),
                    conflict_columns=["agency_id", "trip_sid"],
                )
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

    async def _lookup_route(self, context: Context, route_sid: str) -> Optional[int]:
        """Lookup route ID by route_sid."""
        try:
            async with self.db.createSession() as session:
                stmt = select(Routes).where(
                    Routes.agency_id == self.agency_id,
                    Routes.route_sid == route_sid,
                )
                route = await session.scalar(stmt)
            if route:
                return route.id
            else:
                context.logger.warning(
                    f"Route not found: agency_id={self.agency_id}, route_sid={route_sid}"
                )
                return None
        except Exception as e:
            context.logger.error(f"Error looking up route: {e}")
            raise

    async def _lookup_shape(self, context: Context, shape_sid: str) -> Optional[int]:
        """Lookup shape ID by shape_sid."""
        try:
            async with self.db.createSession() as session:
                stmt = select(Shapes).where(
                    Shapes.agency_id == self.agency_id,
                    Shapes.shape_sid == shape_sid,
                )
                shape = await session.scalar(stmt)
            if shape:
                return shape.id
            else:
                context.logger.warning(
                    f"Shape not found: agency_id={self.agency_id}, shape_sid={shape_sid}"
                )
                return None
        except Exception as e:
            context.logger.error(f"Error looking up shape: {e}")
            raise
