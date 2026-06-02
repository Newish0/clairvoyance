import type { Context } from "./context";

export interface Source<O> {
    run(ctx: Context): AsyncIterable<O>;
}

export interface Transform<I, O> {
    run(ctx: Context, input: AsyncIterable<I>): AsyncIterable<O>;
}

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
        let stream = source.run(ctx);

        for (const t of transforms) {
            stream = t.run(ctx, stream);
        }

        await sink.run(ctx, stream);
    };
}
