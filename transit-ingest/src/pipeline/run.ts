import type { Logger } from "pino";
import type { Result } from "neverthrow";
import { getDb, type Db } from "../db/client";
import { createContext } from "./core/context";
import type { IngestError } from "./core/error";
import { runStatic } from "./gtfs-static";
import { runRealtime } from "./gtfs-realtime";
import { runRealizeInstances } from "./realize-instances";

export function resolveDb(databaseUrl?: string): Db {
    if (!databaseUrl) {
        throw new Error("--database-url <url> or DATABASE_URL env var is required");
    }
    return getDb(databaseUrl);
}

function logSummary(
    result: Result<{ errors: IngestError[]; skipped: number }, IngestError>,
    logger: Logger,
    labels: { ok: string; warn: string; err: string },
): void {
    if (result.isErr()) {
        logger.error({ err: result.error }, labels.err);
        return;
    }
    const summary = result.value;
    if (summary.errors.length > 0) {
        logger.warn({ errors: summary.errors.length, skipped: summary.skipped }, labels.warn);
    } else {
        logger.info(labels.ok);
    }
}

export async function runStaticPipeline(
    db: Db,
    agencyId: string,
    gtfsUrl: string,
    deleteRows: boolean,
    ignoreFeedDup: boolean | undefined,
    realizeInstances: boolean | undefined,
    verbose: boolean,
): Promise<void> {
    const ctx = createContext(db, { agencyId, verbose });
    const result = await runStatic(ctx, gtfsUrl, deleteRows, ignoreFeedDup, realizeInstances);
    if (result.isErr()) {
        ctx.logger.error({ err: result.error }, "Static processing failed");
        throw new Error(result.error.message);
    }
    logSummary(result, ctx.logger, {
        ok: "Static data processed successfully.",
        warn: "Static data processed with recoverable errors",
        err: "Static processing failed",
    });
}

export async function runRealtimePipeline(
    db: Db,
    agencyId: string,
    urls: string[],
    pollInterval: number,
    verbose: boolean,
): Promise<void> {
    const ctx = createContext(db, { agencyId, verbose });
    const onSigint = () => ctx.controller.abort();
    process.on("SIGINT", onSigint);

    ctx.logger.info({ agencyId, urls, poll: pollInterval }, "Realtime config");

    try {
        const result = await runRealtime(ctx, urls, pollInterval);
        logSummary(result, ctx.logger, {
            ok: "Realtime data processed successfully.",
            warn: "Realtime data processed with recoverable errors",
            err: "Realtime processing failed",
        });
    } finally {
        process.removeListener("SIGINT", onSigint);
    }
}

export async function runRealizePipeline(
    db: Db,
    agencyId: string,
    minDate: string | undefined,
    maxDate: string | undefined,
    verbose: boolean,
): Promise<void> {
    const ctx = createContext(db, { agencyId, verbose });
    const result = await runRealizeInstances(ctx, minDate, maxDate);
    if (result.isErr()) {
        ctx.logger.error({ err: result.error }, "Realize instances failed");
        throw new Error(result.error.message);
    }
    logSummary(result, ctx.logger, {
        ok: "Realize instances completed successfully.",
        warn: "Realize instances completed with recoverable errors",
        err: "Realize instances failed",
    });
}
