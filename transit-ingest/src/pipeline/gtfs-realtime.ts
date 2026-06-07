import { fromAsyncThrowable, ok, type Result } from "neverthrow";
import type { Context } from "./core/context";
import { fatalError, type IngestError } from "./core/error";
import { pipe } from "./core/pipe";
import { TripUpdateSink } from "./sink/trip-update-sink";
import { VehiclePositionSink } from "./sink/vehicle-position-sink";
import { ProtobufSource, fetchProtobuf, type ProtobufData } from "./source/protobuf-source";
import { ProtobufDecoder } from "./transformer/protobuf-decoder";
import { TripUpdateTransformer } from "./transformer/trip-update-transformer";
import { VehiclePositionTransformer } from "./transformer/vehicle-position-transformer";

export type RealtimeSummary = {
    errors: IngestError[];
    skipped: number;
};

const safeFetchProtobuf = fromAsyncThrowable(
    fetchProtobuf,
    (e: unknown) => e as IngestError,
);

export async function runRealtime(
    ctx: Context,
    urls: string[],
    pollInterval: number,
): Promise<Result<RealtimeSummary, IngestError>> {
    const lastHashes = new Map<string, string>();

    while (!ctx.controller.signal.aborted) {
        for (const url of urls) {
            const fetchResult = await safeFetchProtobuf(url, ctx.controller.signal);

            if (fetchResult.isErr()) {
                ctx.errors.push(fetchResult.error);
                ctx.skipped++;
                ctx.logger.error({ url, err: fetchResult.error }, "Feed fetch failed, continuing to next");
                continue;
            }

            const data = fetchResult.value;
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
                ctx.logger.error({ url, err: pipelineResult.error }, "Feed failed, continuing to next");
                continue;
            }

            // Only record hash after successful pipeline run - failed feeds should be retried
            lastHashes.set(url, data.hash);

            ctx.logger.debug(
                { url, errors: ctx.errors.length, skipped: ctx.skipped },
                "Feed processed",
            );
        }

        if (pollInterval <= 0) break;

        ctx.logger.debug({ pollInterval }, "Waiting for next poll");
        await new Promise<void>((resolve) => {
            let cleaned = false;
            const cleanup = () => {
                if (cleaned) return;
                cleaned = true;
                clearTimeout(timer);
                ctx.controller.signal.removeEventListener("abort", onAbort);
                resolve();
            };
            const timer = setTimeout(cleanup, pollInterval * 1000);
            const onAbort = () => cleanup();
            ctx.controller.signal.addEventListener("abort", onAbort, { once: true });
        });
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

    return fromAsyncThrowable(
        async () => {
            const results = await Promise.allSettled([vpPipe(ctx), tuPipe(ctx)]);
            for (const r of results) {
                if (r.status === "rejected") throw r.reason;
            }
        },
        (e) => fatalError("REALTIME_PIPELINE_ERROR", `Realtime pipeline failed for ${url}`, e),
    )();
}
