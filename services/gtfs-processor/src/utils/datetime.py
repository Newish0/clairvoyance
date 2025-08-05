from datetime import datetime, timezone, timedelta
import logging
import re
from typing import Optional, Tuple
import pytz


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


def __parse_hhmmss(time_str: Optional[str]) -> Optional[Tuple[int, int, int]]:
    """Parses HH:MM:SS, handling >23 hours. Returns (h, m, s) or None."""
    if not time_str:
        return None
    match = re.match(r"\s*(\d+):([0-5]\d):([0-5]\d)\s*", time_str)
    if match:
        return int(match.group(1)), int(match.group(2)), int(match.group(3))
    return None


def convert_to_datetime(
    date_str: str,
    time_str: str,
    tz_str: str = "UTC",
    logger: Optional[logging.Logger] = None,
) -> datetime:
    parsed_time = __parse_hhmmss(time_str)
    if not parsed_time:
        return None  # Should raise error or be handled by validator
    h, m, s = parsed_time
    base_date = datetime.strptime(date_str, "%Y%m%d").date()
    days_offset = h // 24
    actual_hour = h % 24
    actual_date = base_date + timedelta(days=days_offset)
    # Create naive datetime in given timezone
    tz = pytz.timezone(tz_str)
    naive_dt = datetime(
        actual_date.year, actual_date.month, actual_date.day, actual_hour, m, s
    )
    # Localize to given timezone
    try:
        local_dt = tz.localize(naive_dt, is_dst=None)
    except pytz.AmbiguousTimeError:
        local_dt = tz.localize(
            naive_dt, is_dst=False
        )  # Pick standard time (usually correct for GTFS)
        if logger:
            logger.warning(f"Ambiguous time {naive_dt}, using standard time (converted to {local_dt}).")
    except pytz.NonExistentTimeError:
        local_dt = tz.localize(
            naive_dt, is_dst=True
        )  # Pick daylight saving time (usually correct for GTFS)
        if logger:
            logger.warning(f"Non-existent time {naive_dt}, using daylight saving time (converted to {local_dt}).")

    return local_dt
