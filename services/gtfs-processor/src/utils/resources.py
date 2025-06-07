from logging import Logger
from typing import Optional, Union
import requests
from pathlib import Path
from urllib.parse import urlparse


DataSource = Union[str, Path]


class ResourceFetcher:
    """Handles fetching resources from URLs or local files."""

    def __init__(self, request_timeout: int = 10, logger: Optional[Logger] = None):
        self.request_timeout = request_timeout
        self.logger = logger

    def get_resource(self, data_source: DataSource) -> Optional[bytes]:
        """Fetches resource from URL or reads from file."""
        try:
            if self._is_url(data_source):
                return self._fetch_from_url(str(data_source))
            else:
                return self._read_from_file(data_source)
        except Exception as e:
            self._log_error(f"Unexpected error fetching/reading {data_source}: {e}")
            return None

    def _is_url(self, data_source: DataSource) -> bool:
        """Check if data_source is a URL."""
        if isinstance(data_source, Path):
            return False

        if isinstance(data_source, str):
            parsed = urlparse(data_source)
            return parsed.scheme in ("http", "https")

        return False

    def _fetch_from_url(self, url: str) -> Optional[bytes]:
        """Fetch resource from URL."""
        try:
            response = requests.get(url, timeout=self.request_timeout)
            response.raise_for_status()
            return response.content
        except requests.RequestException as e:
            self._log_error(f"HTTP error fetching {url}: {e}")
            return None

    def _read_from_file(self, data_source: DataSource) -> Optional[bytes]:
        """Read resource from local file."""
        try:
            path = Path(data_source) if isinstance(data_source, str) else data_source

            if not path.is_file():
                self._log_error(f"File not found: {path}")
                return None

            return path.read_bytes()
        except IOError as e:
            self._log_error(f"File I/O error reading {data_source}: {e}")
            return None

    def _log_error(self, message: str) -> None:
        """Log error message if logger is available."""
        if self.logger:
            self.logger.error(message)


# Convenience function
def get_resource(
    data_source: DataSource, request_timeout: int = 10, logger: Optional[Logger] = None
) -> Optional[bytes]:
    """Fetches resource from URL or reads from file."""
    fetcher = ResourceFetcher(request_timeout=request_timeout, logger=logger)
    return fetcher.get_resource(data_source)
