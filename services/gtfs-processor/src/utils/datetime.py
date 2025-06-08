from datetime import datetime, timezone
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
