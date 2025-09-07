from contextlib import asynccontextmanager
from dataclasses import dataclass
import tempfile, shutil, aiohttp, zipfile, pathlib
from typing import AsyncIterator


@dataclass(frozen=True)
class SourceInfo:
    path: pathlib.Path
    hash: str


class GTFSArchiveSource:
    def __init__(self, url: str):
        self.url = url
        self.tmpdir = None

    @asynccontextmanager
    async def materialize(self) -> AsyncIterator[SourceInfo]:
        self.tmpdir = pathlib.Path(tempfile.mkdtemp())
        archive_path = self.tmpdir / "feed.zip"

        # Download
        async with aiohttp.ClientSession() as session:
            async with session.get(self.url) as resp:
                archive_path.write_bytes(await resp.read())

        # Unzip
        with zipfile.ZipFile(archive_path, "r") as zf:
            zf.extractall(self.tmpdir)

        try:
            yield self.tmpdir
        finally:
            shutil.rmtree(self.tmpdir, ignore_errors=True)
