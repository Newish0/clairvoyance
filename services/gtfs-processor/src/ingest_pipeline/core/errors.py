from enum import Enum


class ErrorPolicy(Enum):
    FAIL_FAST = "fail_fast"  # cancel everything on first unhandled error
    SKIP_RECORD = "skip_record"  # log and continue when an item fails
