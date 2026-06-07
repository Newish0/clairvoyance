import { fromBinary } from "@bufbuild/protobuf";
import { FeedMessageSchema, FeedHeader_Incrementality } from "../../gen/proto/gtfs-realtime_pb";
import type { FeedEntity } from "../../gen/proto/gtfs-realtime_pb";
import type { Transform } from "../core/pipe";
import type { Context } from "../core/context";
import { type ItemResult, itemOk, skipItem } from "../core/error";
import type { ProtobufData } from "../source/protobuf-source";

const ACCEPTED_VERSIONS = new Set(["1.0", "2.0"]);

export interface ParsedEntity {
    entity: FeedEntity;
    feedTimestamp: bigint;
}

/**
 * Decodes protobuf bytes into a FeedMessage, validates the header,
 * and yields individual FeedEntity objects.
 */
export class ProtobufDecoder implements Transform<ProtobufData, ParsedEntity> {
    async *run(ctx: Context, input: AsyncIterable<ProtobufData>): AsyncIterable<ItemResult<ParsedEntity>> {
        for await (const { bytes } of input) {
            let feedMessage;
            try {
                feedMessage = fromBinary(FeedMessageSchema, bytes);
            } catch (e) {
                yield skipItem("PROTOBUF_DECODE_ERROR", "Failed to decode FeedMessage", e);
                continue;
            }

            const header = feedMessage.header;
            if (!header) {
                yield skipItem("PROTOBUF_VALIDATION_ERROR", "FeedMessage missing header");
                continue;
            }

            if (!ACCEPTED_VERSIONS.has(header.gtfsRealtimeVersion)) {
                yield skipItem(
                    "PROTOBUF_VERSION_ERROR",
                    `Unsupported GTFS-RT version: ${header.gtfsRealtimeVersion}`,
                );
                continue;
            }

            if (header.incrementality !== FeedHeader_Incrementality.FULL_DATASET) {
                yield skipItem(
                    "PROTOBUF_INCREMENTALITY_ERROR",
                    `Unsupported incrementality: ${header.incrementality} (only FULL_DATASET supported)`,
                );
                continue;
            }

            const feedTimestamp = header.timestamp;

            if (feedTimestamp === 0n) {
                yield skipItem(
                    "PROTOBUF_VALIDATION_ERROR",
                    "FeedMessage header timestamp is 0 (missing or invalid)",
                );
                continue;
            }

            ctx.logger.debug(
                { entities: feedMessage.entity.length, timestamp: Number(feedTimestamp) },
                "FeedMessage decoded",
            );

            for (const entity of feedMessage.entity) {
                if (!entity.id) {
                    yield skipItem(
                        "PROTOBUF_VALIDATION_ERROR",
                        "FeedEntity missing required id field",
                    );
                    continue;
                }
                yield itemOk({ entity, feedTimestamp });
            }
        }
    }
}
