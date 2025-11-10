from typing import AsyncIterator, List, TypeVar, Union

from ingest_pipeline.core.types import Context, Source

T = TypeVar("T")


class PassThroughSource(Source[T]):
    """
    Source that yields the data it was initialized with,
    now generic over the data type T.
    """

    output_type: type

    data: List[T]

    def __init__(self, data: Union[T, List[T]], output_type: type[T] = type):
        self.output_type = output_type

        if isinstance(data, list):
            self.data = data
        else:
            self.data = [data]

    async def stream(self, context: Context) -> AsyncIterator[T]:
        for item in self.data:
            yield item
