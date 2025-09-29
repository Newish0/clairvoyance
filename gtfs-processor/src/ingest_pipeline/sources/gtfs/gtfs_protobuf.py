from contextlib import asynccontextmanager
from dataclasses import dataclass
import hashlib
import pathlib
import aiohttp
from typing import AsyncIterator, Union


@dataclass(frozen=True)
class SourceInfo:
    data: bytes
    hash: str


class ProtobufSource:
    def __init__(self, source: Union[str, pathlib.Path, bytes]):
        self.source = source

    def _get_hash(self, content: bytes) -> str:
        """No need to chunk it. We expect protobuf to be small"""
        return hashlib.sha256(content).hexdigest()

    @asynccontextmanager
    async def materialize(self) -> AsyncIterator[SourceInfo]:
        if isinstance(self.source, str):
            # Download from URL
            async with aiohttp.ClientSession() as session:
                async with session.get(self.source) as resp:
                    content = await resp.read()
        elif isinstance(self.source, pathlib.Path):
            # Read from local file
            content = self.source.read_bytes()
        elif isinstance(self.source, bytes):
            # Use bytes directly
            content = self.source
        else:
            raise ValueError(f"Unsupported source type: {type(self.source)}")

        file_hash = self._get_hash(content)
        yield SourceInfo(data=content, hash=file_hash)
