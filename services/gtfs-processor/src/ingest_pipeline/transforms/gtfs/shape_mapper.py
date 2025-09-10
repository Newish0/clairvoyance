from collections import defaultdict
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List, Tuple
from ingest_pipeline.core.errors import ErrorPolicy
from models.mongo_schemas import Shape, LineStringGeometry
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer


class ShapeMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS shapes.txt rows (dict) into Mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: Mongo UpdateOne
    """

    @dataclass
    class __TmpShapeInfo:
        geometry: Dict[int, Tuple[float, float]] = field(default_factory=dict)
        distances_traveled: Dict[int, float] = field(default_factory=dict)

    __tmp_shapes: Dict[str, __TmpShapeInfo]

    def __init__(self, agency_id: str):
        self.agency_id = agency_id
        self.__tmp_shapes = defaultdict(self.__TmpShapeInfo)

    async def run(
        self, context: Context, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            try:

                pt_lat = (
                    float(row.get("shape_pt_lat")) if "shape_pt_lat" in row else None
                )
                pt_lon = (
                    float(row.get("shape_pt_lon")) if "shape_pt_lon" in row else None
                )
                distances_traveled = (
                    float(row.get("shape_dist_traveled"))
                    if "shape_dist_traveled" in row
                    else None
                )
                pt_sequence = (
                    int(row.get("shape_pt_sequence"))
                    if "shape_pt_sequence" in row
                    else None
                )

                validation_shape_doc = Shape(
                    agency_id=self.agency_id,
                    shape_id=row.get("shape_id"),
                    geometry=LineStringGeometry(coordinates=[(pt_lon, pt_lat)]),
                    distances_traveled=[float(distances_traveled)],
                )

                tmp_shape = self.__tmp_shapes[validation_shape_doc.shape_id]
                tmp_shape.geometry[pt_sequence] = (pt_lon, pt_lat)
                tmp_shape.distances_traveled[pt_sequence] = distances_traveled

            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr(f"shape_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e

        try:
            shape_docs = self.__get_constructed_shape()
            for shape_doc in shape_docs:
                yield UpdateOne(
                    {"agency_id": self.agency_id, "shape_id": shape_doc.shape_id},
                    {"$set": shape_doc.model_dump(exclude={"id"})},
                    upsert=True,
                )
        except Exception as e:
            match context.error_policy:
                case ErrorPolicy.FAIL_FAST:
                    raise e
                case ErrorPolicy.SKIP_RECORD:
                    context.telemetry.incr(f"shape_mapper.skipped")
                    context.logger.error(e)
                case _:
                    raise e

    def __get_constructed_shape(self):
        for shape_id, tmp_shape in self.__tmp_shapes.items():
            yield Shape(
                agency_id=self.agency_id,
                shape_id=shape_id,
                geometry=LineStringGeometry(
                    coordinates=[
                        tmp_shape.geometry[i] for i in sorted(tmp_shape.geometry.keys())
                    ]
                ),
                distances_traveled=[
                    tmp_shape.distances_traveled[i]
                    for i in sorted(tmp_shape.distances_traveled.keys())
                ],
            )
