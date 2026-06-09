import type { Context } from "./context";
import type { ItemResult } from "./error";

/**
 * A **recoverable** error means the pipeline can continue past it:
 * return err(recoverableError(...)) from the stage. routeResults will
 * push it to ctx.errors, increment ctx.skipped, and continue.
 *
 * A **fatal** error means the pipeline cannot make progress:
 * return err(fatalError(...)) from the stage. routeResults will
 * throw the IngestError directly (without pushing to ctx.errors),
 * causing the orchestrator to catch, push, and return err().
 */

export interface Source<O> {
    run(ctx: Context): AsyncIterable<ItemResult<O>>;
}

export interface Transform<I, O> {
    run(ctx: Context, input: AsyncIterable<I>): AsyncIterable<ItemResult<O>>;
}

/**
 * Must handle errors internally instead of with `itemOk` and `skipItem` like in
 * Transform and Source since `run` returns void/Promise<void>.
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
        let stream: AsyncIterable<any> = routeResults(
            monitorStream(source.run(ctx), source.constructor.name, ctx),
            ctx,
        );

        for (const t of transforms) {
            const raw = t.run(ctx, stream);
            stream = routeResults(monitorStream(raw, t.constructor.name, ctx), ctx);
        }

        try {
            await sink.run(ctx, stream);
        } finally {
            Bun.gc(true);
        }
    };
}

async function* routeResults<T>(
    stream: AsyncIterable<ItemResult<T>>,
    ctx: Context,
): AsyncIterable<T> {
    for await (const result of stream) {
        if (result.isOk()) {
            yield result.value;
        } else {
            const e = result.error;
            if (e.severity === "fatal") {
                throw e;
            }
            ctx.errors.push(e);
            ctx.skipped++;
        }
    }
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
