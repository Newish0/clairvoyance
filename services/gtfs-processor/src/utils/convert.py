from typing import TypeVar


def safe_float(value):
    """Safely convert value to float, returning None if conversion fails."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def safe_int(value):
    """Safely convert value to int, returning None if conversion fails."""
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None
