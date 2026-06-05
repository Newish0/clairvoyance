import type { Context } from "./context";

/**
 * A **recoverable** error means the pipeline can continue past it:
 * skip the offending item, push an `IngestError` with
 * `severity: "recoverable"` to `ctx.errors`, and keep yielding.
 *
 * A **fatal** error means the pipeline cannot make progress:
 * let the exception propagate so the orchestrator catches it,
 * pushes an `IngestError` with `severity: "fatal"` to
 * `ctx.errors`, and returns `err()`.
 */

/**
 * Produces items from an external source (file, API, etc.).
 *
 * - **Recoverable** (missing file, parse error): push
 *   `recoverableError(...)` to `ctx.errors` and stop yielding.
 * - **Fatal**: let the exception propagate to the orchestrator.
 */
export interface Source<O> {
    run(ctx: Context): AsyncIterable<O>;
}

/**
 * Transforms each item from an upstream stage.
 *
 * - **Recoverable** (validation failure): push
 *   `recoverableError(...)` to `ctx.errors`, increment
 *   `ctx.skipped`, and skip the item (don't yield it).
 * - **Fatal**: let the exception propagate.
 */
export interface Transform<I, O> {
    run(ctx: Context, input: AsyncIterable<I>): AsyncIterable<O>;
}

/**
 * Persists items (DB write, file write, etc.).
 *
 * - **Recoverable** (batch write failure): push
 *   `recoverableError(...)` to `ctx.errors`, add the failed
 *   item count to `ctx.skipped`, clear the batch, and keep
 *   consuming input. Degraded accuracy is preferable to
 *   aborting — the pipeline can be rerun later.
 * - **Fatal**: let the exception propagate.
 */
export interface Sink<I> {
    run(ctx: Context, input: AsyncIterable<I>): void | Promise<void>;
}

export function pipe<A, B>(
    source: Source<A>,
    t1: Transform<A, B>,
    sink: Sink<B>,
): (ctx: Context) => Promise<void>;

export function pipe<A, B, C>(
    source: Source<A>,
    t1: Transform<A, B>,
    t2: Transform<B, C>,
    sink: Sink<C>,
): (ctx: Context) => Promise<void>;

export function pipe<A, B, C, D>(
    source: Source<A>,
    t1: Transform<A, B>,
    t2: Transform<B, C>,
    t3: Transform<C, D>,
    sink: Sink<D>,
): (ctx: Context) => Promise<void>;

export function pipe<A, B, C, D, E>(
    source: Source<A>,
    t1: Transform<A, B>,
    t2: Transform<B, C>,
    t3: Transform<C, D>,
    t4: Transform<D, E>,
    sink: Sink<E>,
): (ctx: Context) => Promise<void>;

export function pipe(...stages: any[]): (ctx: Context) => Promise<void> {
    const source = stages[0] as Source<any>;
    const sink = stages[stages.length - 1] as Sink<any>;
    const transforms = stages.slice(1, -1) as Transform<any, any>[];

    return async (ctx: Context) => {
        let stream: AsyncIterable<any> = monitorStream(source.run(ctx), source.constructor.name, ctx);

        for (const t of transforms) {
            const raw = t.run(ctx, stream);
            stream = monitorStream(raw, t.constructor.name, ctx);
        }

        try {
            await sink.run(ctx, stream);
        } finally {
            // Ensure upstream generators are closed on early termination or error
            if (typeof stream[Symbol.asyncIterator] === "function") {
                const iterator = stream[Symbol.asyncIterator]();
                if (typeof iterator.return === "function") {
                    await iterator.return();
                }
            }
        }
    };
}

async function* monitorStream<T>(
    stream: AsyncIterable<T>,
    stageName: string,
    ctx: Context,
): AsyncIterable<T> {
    const start = performance.now();
    let count = 0;

    try {
        for await (const item of stream) {
            count++;
            yield item;
        }
    } finally {
        const ms = performance.now() - start;
        ctx.telemetry.incr(`stage.${stageName}.items`, count);
        ctx.telemetry.gauge(`stage.${stageName}.duration_ms`, ms);
        ctx.logger.debug({ stage: stageName, items: count, ms }, "stage complete");
    }
}
