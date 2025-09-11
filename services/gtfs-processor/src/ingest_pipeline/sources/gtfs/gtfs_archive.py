from contextlib import asynccontextmanager
from dataclasses import dataclass
import hashlib
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

    def _get_md5_hash(self, file_path, chunk_size=4096):
        """
        Calculate MD5 hash of a file.

        Args:
            file_path (str or Path): Path to the file

        Returns:
            str: MD5 hash as hexadecimal string

        Raises:
            FileNotFoundError: If file doesn't exist
            IOError: If file cannot be read
        """
        hash_md5 = hashlib.md5()

        try:
            with open(file_path, "rb") as f:
                # Read file in chunks to handle large files efficiently
                for chunk in iter(lambda: f.read(chunk_size), b""):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()

        except FileNotFoundError:
            raise FileNotFoundError(f"File not found: {file_path}")
        except IOError as e:
            raise IOError(f"Error reading file {file_path}: {e}")

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

        file_hash = self._get_md5_hash(archive_path)

        try:
            yield SourceInfo(path=self.tmpdir, hash=file_hash)
        finally:
            shutil.rmtree(self.tmpdir, ignore_errors=True)
