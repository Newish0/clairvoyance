import asyncio
from types import CoroutineType
from typing import AsyncIterator, Any, List

from pymongo.collection import Collection
from pymongo.results import UpdateResult

from ingest_pipeline.core.types import Sink
from beanie import Document


class MongoSink(Sink[CoroutineType[Any, Any, UpdateResult]]):
    """
    Sink that writes Motor CoroutineType[Any, Any, UpdateResult] operations to MongoDB in batches.
    Input: Motor's update one operation CoroutineType[Any, Any, UpdateResult]
    """

    def __init__(self, document: Document, batch_size: int = 1000):
        self.batch_size = batch_size
        self.collection = document.get_motor_collection()
        
        # alias
        self.consume = self.write
    
    
    async def write(
        self, items: AsyncIterator[CoroutineType[Any, Any, UpdateResult]]
    ) -> None:
        buffer: List[CoroutineType[Any, Any, UpdateResult]] = []

        async for op in items:
            buffer.append(op)
            if len(buffer) >= self.batch_size:
                await self._flush(buffer)
                buffer.clear()

        if buffer:
            await self._flush(buffer)
    
    
    
    async def _flush(self, ops: List[CoroutineType[Any, Any, UpdateResult]]) -> None:
        # Offload blocking I/O to a thread pool
        await asyncio.to_thread(self.collection.bulk_write, ops, ordered=False)
