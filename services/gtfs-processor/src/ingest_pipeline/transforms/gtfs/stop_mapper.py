from typing import AsyncIterator, Dict
from ingest_pipeline.core.errors import ErrorPolicy
from models.enums import LocationType, WheelchairBoarding
from models.mongo_schemas import Stop, PointGeometry
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer
from beanie.odm.operators.update.general import Set


class StopMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS stops.txt rows (dict) into Mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: Mongo UpdateOne
    """

    __LOCATION_TYPE_MAPPING = {
        "0": LocationType.STOP_OR_PLATFORM,
        "1": LocationType.STATION,
        "2": LocationType.ENTRANCE_EXIT,
        "3": LocationType.GENERIC_NODE,
        "4": LocationType.BOARDING_AREA,
    }

    __WHEELCHAIR_BOARDING_MAPPING = {
        "0": WheelchairBoarding.NO_INFO,
        "1": WheelchairBoarding.ACCESSIBLE,
        "2": WheelchairBoarding.NOT_ACCESSIBLE,
    }

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            try:
                stop_lat = row.get("stop_lat")
                stop_lon = row.get("stop_lon")

                point_geometry = (
                    PointGeometry(
                        type="Point",
                        coordinates=[float(stop_lon), float(stop_lat)],
                    )
                    if stop_lat and stop_lon
                    else None
                )

                stop_doc = Stop(
                    agency_id=self.agency_id,
                    stop_id=row.get("stop_id"),
                    stop_code=row.get("stop_code"),
                    stop_name=row.get("stop_name"),
                    stop_desc=row.get("stop_desc"),
                    location=point_geometry,
                    zone_id=row.get("zone_id"),
                    stop_url=row.get("stop_url"),
                    location_type=self.__LOCATION_TYPE_MAPPING.get(
                        row.get("location_type")
                    ),
                    parent_station=row.get("parent_station"),
                    stop_timezone=row.get("stop_timezone"),
                    wheelchair_boarding=self.__WHEELCHAIR_BOARDING_MAPPING.get(
                        row.get("wheelchair_boarding")
                    ),
                )

                yield UpdateOne(
                    {"agency_id": self.agency_id, "stop_id": stop_doc.stop_id},
                    {"$set": stop_doc.model_dump(exclude={"id"})},
                    upsert=True,
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr(f"stop_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
