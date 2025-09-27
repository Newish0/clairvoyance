import logging
from typing import Any, Dict, Optional
from ingest_pipeline.core.types import Telemetry


class SimpleTelemetry(Telemetry):
    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or logging.getLogger("typed_orchestrator")
        self.counters: Dict[str, int] = {}

    def log(self, level: int, msg: str, /, **ctx: Any) -> None:
        if ctx:
            self.logger.log(level, "%s | %s", msg, ctx)
        else:
            self.logger.log(level, msg)

    def incr(self, name: str, amount: int = 1) -> None:
        self.counters[name] = self.counters.get(name, 0) + amount

    def gauge(self, name: str, value: float) -> None:
        # no-op in simple telemetry
        pass

    def __str__(self) -> str:
        """Human-readable string representation"""
        lines = [
            "SimpleTelemetry:",
            f"  Logger: {self.logger.name}",
            f"  Counters: {len(self.counters)}",
        ]

        if self.counters:
            lines.append("  Counter values:")
            for name, value in sorted(self.counters.items()):
                lines.append(f"    {name}: {value}")

        return "\n".join(lines)
