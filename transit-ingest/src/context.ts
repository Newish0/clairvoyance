import pino from "pino";
import type { initDb } from "./db/client.ts";

export type PipelineConfig = {
    agencyId: string;
    verbose?: boolean;
};

export type Context = {
    db: ReturnType<typeof initDb>;
    config: PipelineConfig;
    signal: AbortSignal;
    logger: pino.Logger;
    telemetry: {
        incr: (key: string, n?: number) => void;
        gauge: (key: string, value: number) => void;
    };
};

export function createContext(
    db: ReturnType<typeof initDb>,
    config: PipelineConfig,
    signal?: AbortSignal,
): Context {
    return {
        db,
        config,
        signal: signal ?? new AbortController().signal,
        logger: pino({
            level: config.verbose ? "debug" : "info",
            name: config.agencyId,
        }),
        telemetry: {
            incr: (_key, _n = 1) => {},
            gauge: (_key, _value) => {},
        },
    };
}
