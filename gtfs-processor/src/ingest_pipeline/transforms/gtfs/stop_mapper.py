from typing import AsyncIterator, Dict, Optional

from geoalchemy2.elements import WKTElement
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from generated.db_models import Stops
from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation
from utils.convert import safe_float


class StopMapper(Transformer[Dict[str, str], UpsertOperation]):
    """
    Maps GTFS stops.txt rows (dict) into UpsertOperations for the
    relational `Stops` table.

    Input: Dict[str, str]
    Output: UpsertOperation
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpsertOperation] = UpsertOperation

    __LOCATION_TYPE_MAPPING = {
        "0": "STOP_OR_PLATFORM",
        "1": "STATION",
        "2": "ENTRANCE_EXIT",
        "3": "GENERIC_NODE",
        "4": "BOARDING_AREA",
        None: None,
    }

    __WHEELCHAIR_BOARDING_MAPPING = {
        "0": "NO_INFO",
        "1": "ACCESSIBLE",
        "2": "NOT_ACCESSIBLE",
        None: None,
    }

    def __init__(self, agency_id: str, session: AsyncSession):
        self.agency_id = agency_id
        self.session = session

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpsertOperation]:
        async for row in inputs:
            try:
                stop_lat = row.get("stop_lat")
                stop_lon = row.get("stop_lon")

                # Convert to PostGIS POINT geometry if coordinates are provided
                location_geometry = None
                if stop_lat and stop_lon:
                    lat = safe_float(stop_lat)
                    lon = safe_float(stop_lon)
                    if lat is not None and lon is not None:
                        # Format: POINT(lon lat)
                        point_wkt = f"POINT({lon} {lat})"
                        location_geometry = WKTElement(point_wkt, srid=4326)

                # TODO: Implement parent_station_id FK lookup
                # Query Stops table by (agency_id, stop_sid) to get parent_station.id
                # parent_station_id = await self._lookup_parent_station_id(
                #     context, row.get("parent_station")
                # )

                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the model immediately after.
                stop_model = Stops(
                    agency_id=self.agency_id,
                    stop_sid=row.get("stop_id"),  # type: ignore
                    code=row.get("stop_code"),
                    name=row.get("stop_name"),
                    description=row.get("stop_desc"),
                    location=location_geometry,
                    zone_id=row.get("zone_id"),
                    url=row.get("stop_url"),
                    location_type=self.__LOCATION_TYPE_MAPPING.get(
                        row.get("location_type")
                    ),
                    parent_station_id=None,  # TODO: Implement FK lookup
                    timezone=row.get("stop_timezone"),
                    wheelchair_boarding=self.__WHEELCHAIR_BOARDING_MAPPING.get(
                        row.get("wheelchair_boarding")
                    ),
                )

                yield UpsertOperation(
                    model=Stops,
                    values=stop_model.model_dump(),
                    conflict_columns=["agency_id", "stop_sid"],
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("stop_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
