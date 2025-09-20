import asyncio
from pathlib import Path
from typing import AsyncIterator, Union, List

from ingest_pipeline.core.types import Context, Source

PathLike = Union[str, Path]


class LocalFileSource(Source[Path]):
    """
    Source that yields file paths from a local filesystem.

    Useful as a starting point in a pipeline before passing files
    to a decoder stage (CSV, JSON, etc.).
    """

    output_type: type[Path] = Path

    def __init__(self, files: Union[PathLike, List[PathLike]]):
        if isinstance(files, (str, Path)):
            files = [files]
        self.files = [Path(f).resolve() for f in files]

    async def stream(self, context: Context) -> AsyncIterator[Path]:
        for f in self.files:
            if not f.exists():
                context.logger.error(f"File not found: {f}")
                raise FileNotFoundError(f"File not found: {f}")
            # Yield file paths asynchronously so we don't block event loop
            await asyncio.sleep(0)
            yield f
