from typing import AsyncIterator, Dict
from ingest_pipeline.core.errors import ErrorPolicy
from models.enums import PickupDropOff, Timepoint
from models.mongo_schemas import StopTime
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer



class StopTimeMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS stop_times.txt rows (dict) into Mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: Mongo UpdateOne
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpdateOne] = UpdateOne

    __PICKUP_DROP_OFF_MAPPING = {
        "0": PickupDropOff.REGULAR,
        "1": PickupDropOff.NO_PICKUP_OR_DROP_OFF,
        "2": PickupDropOff.PHONE_AGENCY,
        "3": PickupDropOff.COORDINATE_WITH_DRIVER,
        None: None,
    }

    __TIMEPOINT_MAPPING = {"0": Timepoint.APPROXIMATE, "1": Timepoint.EXACT, None: None}

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in inputs:
            try:
                stop_sequence_raw = row.get("stop_sequence")
                stop_sequence = (
                    int(stop_sequence_raw)
                    if stop_sequence_raw not in (None, "")
                    else None
                )

                shape_dist_traveled_raw = row.get("shape_dist_traveled")
                shape_dist_traveled = (
                    float(shape_dist_traveled_raw)
                    if shape_dist_traveled_raw not in (None, "")
                    else None
                )

                # Type ignore to bypass static type checking for required fields.
                # We know these fields may be wrong. We validate the model immediately after.
                stop_time = StopTime(
                    agency_id=self.agency_id,
                    trip_id=row.get("trip_id"),  # type: ignore
                    arrival_time=row.get("arrival_time"),  # type: ignore
                    departure_time=row.get("departure_time"),  # type: ignore
                    stop_id=row.get("stop_id"),
                    stop_sequence=stop_sequence,  # type: ignore
                    stop_headsign=row.get("stop_headsign"),
                    pickup_type=self.__PICKUP_DROP_OFF_MAPPING.get(
                        row.get("pickup_type")
                    ),
                    drop_off_type=self.__PICKUP_DROP_OFF_MAPPING.get(
                        row.get("drop_off_type")
                    ),
                    timepoint=self.__TIMEPOINT_MAPPING.get(row.get("timepoint")),  # type: ignore
                    shape_dist_traveled=shape_dist_traveled,
                )

                await stop_time.validate_self()

                yield UpdateOne(
                    {
                        "agency_id": self.agency_id,
                        "trip_id": stop_time.trip_id,
                        "stop_sequence": stop_time.stop_sequence,
                    },
                    {"$set": stop_time.model_dump(exclude={"id"})},
                    upsert=True,
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("stop_time_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e
