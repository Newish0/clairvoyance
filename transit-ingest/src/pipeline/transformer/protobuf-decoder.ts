import { fromBinary, toJson } from "@bufbuild/protobuf";
import { FeedMessageSchema, FeedHeader_Incrementality } from "../../gen/proto/gtfs-realtime_pb";
import type { FeedEntity } from "../../gen/proto/gtfs-realtime_pb";
import type { Transform } from "../core/pipe";
import type { Context } from "../core/context";
import { recoverableError } from "../core/error";
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
    async *run(ctx: Context, input: AsyncIterable<ProtobufData>): AsyncIterable<ParsedEntity> {
        for await (const { bytes } of input) {
            let feedMessage;
            try {
                feedMessage = fromBinary(FeedMessageSchema, bytes);
                // const json = toJson(FeedMessageSchema, feedMessage);
                // console.log(JSON.stringify(json, null, 2));
                // return
            } catch (e) {
                ctx.errors.push(
                    recoverableError("PROTOBUF_DECODE_ERROR", "Failed to decode FeedMessage", e),
                );
                ctx.skipped++;
                continue;
            }

            // Validate header
            const header = feedMessage.header;
            if (!header) {
                ctx.errors.push(
                    recoverableError("PROTOBUF_VALIDATION_ERROR", "FeedMessage missing header"),
                );
                ctx.skipped++;
                continue;
            }

            if (!ACCEPTED_VERSIONS.has(header.gtfsRealtimeVersion)) {
                ctx.errors.push(
                    recoverableError(
                        "PROTOBUF_VERSION_ERROR",
                        `Unsupported GTFS-RT version: ${header.gtfsRealtimeVersion}`,
                    ),
                );
                ctx.skipped++;
                continue;
            }

            if (header.incrementality !== FeedHeader_Incrementality.FULL_DATASET) {
                ctx.errors.push(
                    recoverableError(
                        "PROTOBUF_INCREMENTALITY_ERROR",
                        `Unsupported incrementality: ${header.incrementality} (only FULL_DATASET supported)`,
                    ),
                );
                ctx.skipped++;
                continue;
            }

            const feedTimestamp = header.timestamp;

            if (feedTimestamp === 0n) {
                ctx.errors.push(
                    recoverableError(
                        "PROTOBUF_VALIDATION_ERROR",
                        "FeedMessage header timestamp is 0 (missing or invalid)",
                    ),
                );
                ctx.skipped++;
                continue;
            }

            ctx.logger.debug(
                { entities: feedMessage.entity.length, timestamp: Number(feedTimestamp) },
                "FeedMessage decoded",
            );

            for (const entity of feedMessage.entity) {
                if (!entity.tripUpdate) continue;
                if (!entity.id) {
                    ctx.errors.push(
                        recoverableError(
                            "PROTOBUF_VALIDATION_ERROR",
                            "FeedEntity missing required id field",
                        ),
                    );
                    ctx.skipped++;
                    continue;
                }
                yield { entity, feedTimestamp };
            }
        }
    }
}
