import asyncio
from typing import AsyncIterator, List

from beanie import Document
from pymongo import UpdateOne
from pymongo.results import BulkWriteResult

from ingest_pipeline.core.types import Context, Sink


class MongoUpsertSink(Sink[UpdateOne]):
    """
    Sink that writes Motor UpdateOne operations to MongoDB in batches.
    Input: Motor's update one operation UpdateOne
    """

    input_type: type[UpdateOne] = UpdateOne

    def __init__(self, document: type[Document], batch_size: int = 1000):
        self.batch_size = batch_size
        self.collection = document.get_pymongo_collection()

    async def consume(self, context: Context, inputs: AsyncIterator[UpdateOne]) -> None:
        buffer: List[UpdateOne] = []
        buffer_lock = asyncio.Lock()

        async for op in inputs:
            buffer.append(op)
            if len(buffer) >= self.batch_size:
                async with buffer_lock:
                    ops_to_flush = buffer.copy()
                    buffer.clear()
                write_result = await self._flush(ops_to_flush)
                self._write_result_telemetry(write_result, context)

        if buffer:
            write_result = await self._flush(buffer)
            self._write_result_telemetry(write_result, context)

    async def _flush(self, ops: List[UpdateOne]):
        if not ops:
            return
        return await self.collection.bulk_write(ops, ordered=False)

    def _write_result_telemetry(
        self, write_result: BulkWriteResult | None, context: Context
    ):
        if write_result:
            context.telemetry.incr(
                "mongo_upsert_sink.matched_count", write_result.matched_count
            )
            context.telemetry.incr(
                "mongo_upsert_sink.modified_count", write_result.modified_count
            )
            context.telemetry.incr(
                "mongo_upsert_sink.upserted_count", write_result.upserted_count
            )
            context.telemetry.incr(
                "mongo_upsert_sink.inserted_count", write_result.inserted_count
            )
            context.telemetry.incr(
                "mongo_upsert_sink.deleted_count", write_result.deleted_count
            )
        else:
            context.telemetry.incr("mongo_upsert_sink.no_operations_flushed")
