from dataclasses import dataclass
from typing import AsyncIterator, Type
from ingest_pipeline.core.errors import ErrorPolicy
from lib import gtfs_realtime_pb2 as pb
from ingest_pipeline.core.types import Context, Transformer


@dataclass(frozen=True)
class ParsedEntity:
    entity: pb.FeedEntity
    timestamp: int


class GTFSRealtimeProtobufDecoder(Transformer[bytes, ParsedEntity]):
    """ """

    input_type: Type[bytes] = bytes
    output_type: Type[ParsedEntity] = ParsedEntity

    __ACCEPTED_VERSIONS = ["1.0", "2.0"]

    def __init__(self):
        pass

    async def run(
        self, context: Context, inputs: AsyncIterator[bytes]
    ) -> AsyncIterator[ParsedEntity]:
        async for data in inputs:
            feed_message = pb.FeedMessage.FromString(data)

            try:
                self._validate_header(feed_message.header)
            except Exception as e:
                match context.error_policy:
                    case ErrorPolicy.SKIP_RECORD:
                        context.telemetry.incr(f"gtfs_realtime_protobuf_mapper.skipped")
                        context.logger.error(
                            f"Failed to validate header {e}", exc_info=e
                        )
                        continue
                    case _:  # Default: FAIL_FAST
                        raise e

            for entity in feed_message.entity:
                yield ParsedEntity(entity, feed_message.header.timestamp)

    def _validate_header(self, header: pb.FeedHeader):
        if header.gtfs_realtime_version not in self.__ACCEPTED_VERSIONS:
            raise Exception(
                f"Unsupported GTFS Realtime version: {header.gtfs_realtime_version}"
            )

        if header.incrementality != pb.FeedHeader.FULL_DATASET:
            raise Exception(
                f"Unsupported GTFS Realtime incrementality: {header.incrementality}"
            )
