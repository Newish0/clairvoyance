import asyncio
from types import CoroutineType
from typing import AsyncIterator, Any, List

from pymongo.collection import Collection
from pymongo import UpdateOne

from ingest_pipeline.core.types import Context, Sink
from beanie import Document


class MongoUpsertSink(Sink[UpdateOne]):
    """
    Sink that writes Motor UpdateOne operations to MongoDB in batches.
    Input: Motor's update one operation UpdateOne
    """

    def __init__(self, document: Document, batch_size: int = 1000):
        self.batch_size = batch_size
        self.collection = document.get_motor_collection()

    async def consume(self, context: Context, items: AsyncIterator[UpdateOne]) -> None:
        buffer: List[UpdateOne] = []

        async for op in items:
            buffer.append(op)
            if len(buffer) >= self.batch_size:
                ops_to_flush = buffer.copy()
                buffer.clear()
                await self._flush(ops_to_flush)

        if buffer:
            await self._flush(buffer)

    async def _flush(self, ops: List[UpdateOne]) -> None:
        if not ops:
            return
        # Offload blocking I/O to a thread pool
        await asyncio.to_thread(self.collection.bulk_write, ops, ordered=False)
