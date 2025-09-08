from typing import AsyncIterator, Dict
from models.enums import PickupDropOff, Timepoint
from models.mongo_schemas import StopTime
from pymongo import UpdateOne
from ingest_pipeline.core.types import Transformer
from beanie.odm.operators.update.general import Set


class StopTimeMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS stop_times.txt rows (dict) into Mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: Mongo UpdateOne
    """

    __PICKUP_DROP_OFF_MAPPING = {
        "0": PickupDropOff.REGULAR,
        "1": PickupDropOff.NO_PICKUP_OR_DROP_OFF,
        "2": PickupDropOff.PHONE_AGENCY,
        "3": PickupDropOff.COORDINATE_WITH_DRIVER,
    }

    __TIMEPOINT_MAPPING = {
        "0": Timepoint.APPROXIMATE,
        "1": Timepoint.EXACT,
    }

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            stop_time = StopTime(
                agency_id=self.agency_id,
                trip_id=row["trip_id"],
                arrival_time=row["arrival_time"],
                departure_time=row["departure_time"],
                stop_id=row["stop_id"],
                stop_sequence=int(row["stop_sequence"]),
                stop_headsign=row["stop_headsign"],
                pickup_type=self.__PICKUP_DROP_OFF_MAPPING.get(
                    row["pickup_type"], None
                ),
                drop_off_type=self.__PICKUP_DROP_OFF_MAPPING.get(
                    row["drop_off_type"], None
                ),
                timepoint=self.__TIMEPOINT_MAPPING.get(row["timepoint"], None),
                shape_dist_traveled=float(row["shape_dist_traveled"]),
            )

            yield UpdateOne(
                {
                    "agency_id": self.agency_id,
                    "trip_id": stop_time.trip_id,
                    "stop_sequence": stop_time.stop_sequence,
                },
                {"$set": stop_time.model_dump(exclude={"id"})},
                upsert=True,
            )
