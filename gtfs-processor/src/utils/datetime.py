from datetime import datetime, timezone, timedelta
import logging
import re
from typing import Optional, Tuple
import pytz


_TIME_RE = re.compile(r"\A\s*(\d+):([0-5]\d):([0-5]\d)\s*\Z")


def as_utc(dt: datetime | str | int | float) -> datetime:
    """
    Forces a datetime or time string to UTC and interprets timestamp as epoch seconds
    """
    if isinstance(dt, datetime):
        return dt.replace(tzinfo=timezone.utc)
    elif isinstance(dt, str):
        return datetime.fromisoformat(dt).replace(tzinfo=timezone.utc)
    else:
        return datetime.fromtimestamp(dt, tz=timezone.utc)


def _parse_hhmmss(time_str: Optional[str]) -> Optional[Tuple[int, int, int]]:
    """Parse HHH:MM:SS or H:MM:SS, returns (h, m, s) or None if invalid/empty."""
    if not time_str:
        return None
    m = _TIME_RE.fullmatch(time_str)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def _get_noon_in_timezone(timezone_str: str, date_str: str) -> datetime:
    """ "
    Return an timezone aware datetime for noon on the given date in the given timezone.
    date_str must be "%Y%m%d". Raises ValueError for bad inputs / unknown tz.
    """
    try:
        tz = pytz.timezone(timezone_str)
    except pytz.UnknownTimeZoneError as exc:
        raise ValueError(f"Unknown timezone: {timezone_str}") from exc

    try:
        date_obj = datetime.strptime(date_str, "%Y%m%d")
    except ValueError as exc:
        raise ValueError(f"Invalid date string '{date_str}': {exc}") from exc

    noon_naive = datetime(date_obj.year, date_obj.month, date_obj.day, 12, 0, 0)
    localized_noon = tz.localize(noon_naive)  # noon is generally safe to localize
    return localized_noon


def convert_to_datetime(
    date_str: str,
    time_str: str,
    tz_str: str = "UTC",
    logger: Optional[logging.Logger] = None,
) -> datetime | None:
    """
    GTFS "Time" is defined as follows:
    Time in the HH:MM:SS format (H:MM:SS is also accepted).
    The time is measured from "noon minus 12h" of the service day (effectively
    midnight except for days on which daylight savings time changes occur).
    For times occurring after midnight on the service day, enter the time as
    a value greater than 24:00:00 in HH:MM:SS.

    Args:
        date_str (str): Service date
        time_str (str): Time
        tz_str (str, optional): Timezone. Defaults to "UTC".
        logger (Optional[logging.Logger], optional): Logger. Defaults to None.

    Returns:
        datetime: Datetime in given timezone
    """
    try:
        parsed_time = _parse_hhmmss(time_str)

        if not parsed_time:
            return None

        h, m, s = parsed_time

        # Get noon localized, then subtract 12 hours to follow GTFS "noon - 12h" rule:
        localized_noon = _get_noon_in_timezone(tz_str, date_str)
        tz = pytz.timezone(tz_str)

        # Use tz.normalize after arithmetic to ensure correct DST offset if we cross it.
        service_midnight = tz.normalize(localized_noon - timedelta(hours=12))

        result = tz.normalize(
            service_midnight + timedelta(hours=h, minutes=m, seconds=s)
        )

        return result
    except Exception as e:
        if logger:
            logger.error(f"Error converting time: {e}", exc_info=True)
        return None
