from collections import defaultdict
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List

from generated.db_models import Shapes
from geoalchemy2.elements import WKTElement

from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.types import Context, Transformer
from ingest_pipeline.sinks.postgres_upsert_sink import UpsertOperation
from utils.convert import safe_float, safe_int


class ShapeMapper(Transformer[Dict[str, str], UpsertOperation]):
    """
    Maps GTFS shapes.txt rows (dict) into UpsertOperations for the
    relational `Shapes` table. Aggregates multiple shape points into
    a single LineString geometry.

    Input: Dict[str, str]
    Output: UpsertOperation
    """

    input_type: type[Dict[str, str]] = Dict[str, str]
    output_type: type[UpsertOperation] = UpsertOperation

    @dataclass
    class __TmpShapeInfo:
        geometry: Dict[int, List[float]] = field(default_factory=dict)
        distances_traveled: Dict[int, float] = field(default_factory=dict)

    __tmp_shapes: Dict[str, __TmpShapeInfo] = defaultdict(__TmpShapeInfo)

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, inputs: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpsertOperation]:
        async for row in inputs:
            try:
                shape_id = row.get("shape_id")
                pt_lat = safe_float(row.get("shape_pt_lat"))
                pt_lon = safe_float(row.get("shape_pt_lon"))
                distances_traveled = safe_float(row.get("shape_dist_traveled"))
                pt_sequence = safe_int(row.get("shape_pt_sequence"))

                if (
                    shape_id is None
                    or pt_lat is None
                    or pt_lon is None
                    or pt_sequence is None
                ):
                    raise ValueError("Required shape fields are missing")

                # Collect shape points for aggregation
                tmp_shape = self.__tmp_shapes[shape_id]
                tmp_shape.geometry[pt_sequence] = [pt_lon, pt_lat]
                if distances_traveled is not None:
                    tmp_shape.distances_traveled[pt_sequence] = distances_traveled

            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("shape_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e

        # Yield aggregated shapes as UpsertOperations
        for shape_model in self.__get_constructed_shape():
            try:
                yield UpsertOperation(
                    model=Shapes,
                    values=shape_model.model_dump(),
                    conflict_columns=["agency_id", "shape_sid"],
                )
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.FAIL_FAST:
                        raise e
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr("shape_mapper.skipped")
                        context.logger.error(e)
                        continue
                    case _:
                        raise e

    def __get_constructed_shape(self):
        for shape_id, tmp_shape in self.__tmp_shapes.items():
            # PostGIS LineString must have at least 2 vertices.
            # So for a single point, we duplicate the point with a small offset.
            # Note: it's safe to assume we have at least 1 point at this point in the code.
            sorted_sequences = sorted(tmp_shape.geometry.keys())
            coordinates = (
                [tmp_shape.geometry[i] for i in sorted_sequences]
                if len(tmp_shape.geometry) > 1
                else [
                    tmp_shape.geometry[sorted_sequences[0]],
                    [
                        tmp_shape.geometry[sorted_sequences[0]][0] + 0.00001,
                        tmp_shape.geometry[sorted_sequences[0]][1] + 0.00001,
                    ],
                ]
            )

            # Convert coordinates to PostGIS LINESTRING WKT format
            # Format: LINESTRING(lon1 lat1, lon2 lat2, ...)
            linestring_coords = ", ".join(
                f"{coord[0]} {coord[1]}" for coord in coordinates
            )
            linestring_wkt = f"LINESTRING({linestring_coords})"
            # Use WKTElement with SRID for PostGIS geometry
            path_geometry = WKTElement(linestring_wkt, srid=4326)

            # Convert distances_traveled to dict format for JSONB
            distances_dict = None
            if tmp_shape.distances_traveled:
                sorted_distances = [
                    tmp_shape.distances_traveled.get(i)
                    for i in sorted_sequences
                    if i in tmp_shape.distances_traveled
                ]
                if len(sorted_distances) > 1:
                    distances_dict = {"values": sorted_distances}
                elif len(sorted_distances) == 1:
                    distances_dict = {
                        "values": [sorted_distances[0], sorted_distances[0]]
                    }

            yield Shapes(
                agency_id=self.agency_id,
                shape_sid=shape_id,
                path=path_geometry,  # WKTElement for PostGIS geometry
                distances_traveled=distances_dict,
            )  # pyright: ignore[reportCallIssue] - id is not needed for constructor
