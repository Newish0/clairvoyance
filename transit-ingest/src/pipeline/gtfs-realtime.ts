import { fromAsyncThrowable, ok, type Result } from "neverthrow";
import type { Context } from "./core/context";
import { fatalError, type IngestError } from "./core/error";
import { pipe } from "./core/pipe";
import { TripUpdateSink } from "./sink/trip-update-sink";
import { VehiclePositionSink } from "./sink/vehicle-position-sink";
import {
    ProtobufSource,
    fetchProtobuf,
    type CachedHeaders,
    type ProtobufData,
} from "./source/protobuf-source";
import { ProtobufDecoder } from "./transformer/protobuf-decoder";
import { TripUpdateTransformer } from "./transformer/trip-update-transformer";
import { VehiclePositionTransformer } from "./transformer/vehicle-position-transformer";
import { AlertTransformer } from "./transformer/alert-transformer";
import { AlertSink } from "./sink/alert-sink";

export type RealtimeSummary = {
    errors: IngestError[];
    skipped: number;
};

const safeFetchProtobuf = fromAsyncThrowable(fetchProtobuf, (e: unknown) => e as IngestError);

export async function runRealtime(
    ctx: Context,
    urls: string[],
    lastHashes: Map<string, string>,
    lastCachedHeaders: Map<string, CachedHeaders>,
): Promise<Result<RealtimeSummary, IngestError>> {
    for (const url of urls) {
        const fetchResult = await safeFetchProtobuf(
            url,
            ctx.controller.signal,
            lastHashes.get(url),
            lastCachedHeaders.get(url),
        );

        if (fetchResult.isErr()) {
            ctx.errors.push(fetchResult.error);
            ctx.skipped++;
            ctx.logger.error(
                { url, err: fetchResult.error },
                "Feed fetch failed, continuing to next",
            );
            continue;
        }

        const result = fetchResult.value;

        if (!result.changed) {
            ctx.logger.debug({ url }, "Feed unchanged (304 or hash match), skipping");
            continue;
        }

        const { data } = result;

        const prevHash = lastHashes.get(url);

        if (prevHash === data.hash) {
            ctx.logger.debug({ url, hash: data.hash }, "Feed unchanged, skipping");
            continue;
        }

        ctx.logger.debug(
            { url, bytes: data.bytes.length, hash: data.hash },
            "Processing realtime feed",
        );

        const pipelineResult = await runPipelines(ctx, data, url);

        if (pipelineResult.isErr()) {
            ctx.errors.push(pipelineResult.error);
            ctx.skipped++;
            ctx.logger.error(
                { url, err: pipelineResult.error },
                "Feed failed, continuing to next",
            );
            continue;
        }

        // Only record hash after successful pipeline run - failed feeds should be retried
        lastHashes.set(url, data.hash);
        lastCachedHeaders.set(url, result.cachedHeaders);

        ctx.logger.debug(
            { url, errors: ctx.errors.length, skipped: ctx.skipped },
            "Feed processed",
        );
    }

    return ok({ errors: ctx.errors, skipped: ctx.skipped });
}

async function runPipelines(
    ctx: Context,
    data: ProtobufData,
    url: string,
): Promise<Result<void, IngestError>> {
    const vpPipe = pipe(
        new ProtobufSource(data),
        new ProtobufDecoder(),
        new VehiclePositionTransformer(),
        new VehiclePositionSink(),
    );

    const tuPipe = pipe(
        new ProtobufSource(data),
        new ProtobufDecoder(),
        new TripUpdateTransformer(),
        new TripUpdateSink(),
    );

    const alertPipe = pipe(
        new ProtobufSource(data),
        new ProtobufDecoder(),
        new AlertTransformer(),
        new AlertSink(),
    );

    return fromAsyncThrowable(
        async () => {
            const results = await Promise.allSettled([vpPipe(ctx), tuPipe(ctx), alertPipe(ctx)]);
            for (const r of results) {
                if (r.status === "rejected") throw r.reason;
            }
        },
        (e) => fatalError("REALTIME_PIPELINE_ERROR", `Realtime pipeline failed for ${url}`, e),
    )();
}
