from dataclasses import dataclass
from typing import (
    Any,
    AsyncIterator,
    Generic,
    Protocol,
    Type,
    TypeVar,
    Union,
)
import logging

from ingest_pipeline.core.errors import ErrorPolicy


T = TypeVar("T")
U = TypeVar("U")


class Telemetry(Protocol):
    def log(self, level: int, msg: str, /, **ctx: Any) -> None: ...

    def incr(self, name: str, amount: int = 1) -> None: ...

    def gauge(self, name: str, value: float) -> None: ...


@dataclass
class Context:
    """Shared context passed to all pipeline stages."""

    logger: logging.Logger
    telemetry: Telemetry
    error_policy: ErrorPolicy


class Source(Protocol[T]):
    """Produces items of type T. Implementations should set .output_type."""

    output_type: Type[T]  # concrete Python type (or typing.Any)

    async def stream(self, context: Context) -> AsyncIterator[T]:
        """Yield items and then return."""
        yield  # type: ignore


class Transformer(Protocol, Generic[T, U]):
    """Consumes T, yields U. Implementations should set .input_type and .output_type."""

    input_type: Type[T]
    output_type: Type[U]

    async def run(self, context: Context, inputs: AsyncIterator[T]) -> AsyncIterator[U]:
        """Consume async iterator of T, produce async iterator of U."""
        yield  # type: ignore


class Sink(Protocol[T]):
    """Consume items of type T and persist them. Set .input_type on implementation."""

    input_type: Type[T]

    async def consume(self, context: Context, inputs: AsyncIterator[T]) -> None:
        """Consume an async iterator until exhaustion."""
        ...


@dataclass
class StageSpec:
    """A descriptor for one stage in the pipeline."""

    name: str
    stage: Union[
        Source, Transformer, Sink
    ]  # instance implementing Source/Transformer/Sink
    parallelism: int = 1
    queue_size: int = 100  # queue between this stage and next stage
