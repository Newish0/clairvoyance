import { err, ok, type Result } from "neverthrow";
import type { Context } from "./core/context";
import { fatalError, type IngestError } from "./core/error";
import { pipe } from "./core/pipe";
import { ProtobufSource, fetchProtobuf } from "./source/protobuf-source";
import { ProtobufDecoder } from "./transformer/protobuf-decoder";
import { TripUpdateTransformer } from "./transformer/trip-update-transformer";
import { TripUpdateSink } from "./sink/trip-update-sink";

export type RealtimeSummary = {
    errors: IngestError[];
    skipped: number;
};

export async function runRealtime(
    ctx: Context,
    urls: string[],
    pollInterval: number,
): Promise<Result<RealtimeSummary, IngestError>> {
    const lastHashes = new Map<string, string>();

    while (!ctx.controller.signal.aborted) {
        for (const url of urls) {
            // Fetch + hash + dedup
            let data;
            try {
                data = await fetchProtobuf(url, ctx.controller.signal);
            } catch (e) {
                ctx.errors.push(fatalError("REALTIME_FETCH_ERROR", `Failed to fetch ${url}`, e));
                ctx.skipped++;
                ctx.logger.error({ url, err: e }, "Feed fetch failed, continuing to next");
                continue;
            }

            const prevHash = lastHashes.get(url);
            if (prevHash === data.hash) {
                ctx.logger.debug({ url, hash: data.hash }, "Feed unchanged, skipping");
                continue;
            }
            lastHashes.set(url, data.hash);

            ctx.logger.debug(
                { url, bytes: data.bytes.length, hash: data.hash },
                "Processing realtime feed",
            );

            const source = new ProtobufSource(data);
            const decoder = new ProtobufDecoder();
            const mapper = new TripUpdateTransformer();
            const sink = new TripUpdateSink();

            const run = pipe(source, decoder, mapper, sink);

            try {
                await run(ctx);
                // Only record hash after successful pipeline run — failed feeds should be retried
                lastHashes.set(url, data.hash);
            } catch (e) {
                const error = fatalError(
                    "REALTIME_PIPELINE_ERROR",
                    `Realtime pipeline failed for ${url}`,
                    e,
                );
                ctx.errors.push(error);
                ctx.skipped++;
                ctx.logger.error({ url, err: e }, "Feed failed, continuing to next");
                continue;
            }

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
