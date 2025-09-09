from typing import AsyncIterator, Dict
from ingest_pipeline.core.errors import ErrorPolicy
from models.mongo_schemas import Shape, LineStringGeometry
from pymongo import UpdateOne
from ingest_pipeline.core.types import Context, Transformer
from beanie.odm.operators.update.general import Set


class ShapeMapper(Transformer[Dict[str, str], UpdateOne]):
    """
    Maps GTFS shapes.txt rows (dict) into Mongo UpdateOne operations after validation through DB model.
    Input: Dict[str, str]
    Output: Mongo UpdateOne
    """

    def __init__(self, agency_id: str):
        self.agency_id = agency_id

    async def run(
        self, context: Context, items: AsyncIterator[Dict[str, str]]
    ) -> AsyncIterator[UpdateOne]:
        async for row in items:
            try:
                shape_doc = Shape(
                    agency_id=self.agency_id,
                )

                # TODO: Figure out how to upsert shapes b/c we store the entire geometry as a LineString

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
                        continue
                    case _:
                        raise e
