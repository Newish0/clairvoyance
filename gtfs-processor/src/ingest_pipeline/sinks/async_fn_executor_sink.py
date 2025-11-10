import asyncio
from typing import AsyncIterator, List

from collections.abc import Callable, Awaitable

from ingest_pipeline.core.types import Context, Sink


class AsyncFunctionExecutorSink(Sink[Callable[[], Awaitable]]):
    """
    Sink that executes async functions in batches.
    Input: Async functions (Callable[[], Awaitable])
    """

    input_type: Callable[[], Awaitable] = type(Callable[[], Awaitable])

    def __init__(self, batch_size: int = 1000):
        self.batch_size = batch_size

    async def consume(
        self, context: Context, inputs: AsyncIterator[Callable[[], Awaitable]]
    ) -> None:
        buffer: List[Callable[[], Awaitable]] = []
        buffer_lock = asyncio.Lock()

        async for async_func in inputs:
            buffer.append(async_func)
            if len(buffer) >= self.batch_size:
                async with buffer_lock:
                    funcs_to_execute = buffer.copy()
                    buffer.clear()
                await self._execute_batch(funcs_to_execute)

        if buffer:
            await self._execute_batch(buffer)

    async def _execute_batch(self, funcs: List[Callable[[], Awaitable]]) -> None:
        if not funcs:
            return

        # Execute all functions concurrently
        await asyncio.gather(*[func() for func in funcs], return_exceptions=True)
