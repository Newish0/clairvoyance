from typing import AsyncIterator, Dict
from models.enums import LocationType, WheelchairBoarding
from models.mongo_schemas import Stop, PointGeometry
from pymongo import UpdateOne
from ingest_pipeline.core.types import Transformer
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
        self, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            stop_lat = row["stop_lat"]
            stop_lon = row["stop_lon"]

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
                stop_id=row["stop_id"],
                stop_code=row["stop_code"],
                stop_name=row["stop_name"],
                stop_desc=row["stop_desc"],
                location=point_geometry,
                zone_id=row["zone_id"],
                stop_url=row["stop_url"],
                location_type=self.__LOCATION_TYPE_MAPPING.get(
                    row["location_type"], None
                ),
                parent_station=row["parent_station"],
                stop_timezone=row["stop_timezone"],
                wheelchair_boarding=self.__WHEELCHAIR_BOARDING_MAPPING.get(
                    row["wheelchair_boarding"], None
                ),
            )

            yield UpdateOne(
                {"agency_id": self.agency_id, "stop_id": stop_doc.stop_id},
                {"$set": stop_doc.model_dump(exclude={"id"})},
                upsert=True,
            )
