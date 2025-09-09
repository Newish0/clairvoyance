import asyncio
import csv
from pathlib import Path
from typing import AsyncIterator, Dict, Type

from ingest_pipeline.core.types import Context, Transformer


class CSVDecoder(Transformer[Path, Dict[str, str]]):
    """
    Transformer that streams CSV rows as dicts.
    Input: Path
    Output: Dict[str, str]

    Uses a background thread + asyncio.Queue for safe streaming
    of arbitrarily large CSV files.
    """
    
    input_type: Type[Path] = Path
    output_type: Type[Dict[str, str]] = Dict[str, str]

    def __init__(self, queue_size: int = 1000):
        self.queue_size = queue_size

    async def run(  
        self, context: Context, inputs: AsyncIterator[Path]  
    ) -> AsyncIterator[Dict[str, str]]:
        async for path in inputs: 
            queue: asyncio.Queue = asyncio.Queue(self.queue_size)

            async def produce():
                def _producer():
                    with open(path, newline="", encoding="utf-8-sig") as f:  # utf-8-sig handles BOM
                        reader = csv.DictReader(f)
                        for row in reader:
                            asyncio.run_coroutine_threadsafe(queue.put(row), loop)
                    # Signal end of stream
                    asyncio.run_coroutine_threadsafe(queue.put(None), loop)

                loop = asyncio.get_running_loop()
                await asyncio.to_thread(_producer)

            # Start producer
            producer_task = asyncio.create_task(produce())

            # Consume from queue
            while True:
                row = await queue.get()
                if row is None:
                    break
                yield row

            await producer_task