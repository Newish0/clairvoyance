import asyncio
from pathlib import Path
from typing import AsyncIterator, Union, List

from ingest_pipeline.core.types import Source

PathLike = Union[str, Path]


class LocalFileSource(Source[Path]):
    """
    Source that yields file paths from a local filesystem.

    Useful as a starting point in a pipeline before passing files
    to a decoder stage (CSV, JSON, etc.).
    """

    def __init__(self, files: Union[PathLike, List[PathLike]]):
        if isinstance(files, (str, Path)):
            files = [files]
        self.files = [Path(f).resolve() for f in files]

    async def stream(self) -> AsyncIterator[Path]:
        for f in self.files:
            if not f.exists():
                raise FileNotFoundError(f"File not found: {f}")
            # Yield file paths asynchronously so we don't block event loop
            await asyncio.sleep(0)
            yield f
