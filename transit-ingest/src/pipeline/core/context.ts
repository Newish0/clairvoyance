import pino from "pino";
import type { Db } from "../db/client";

export type PipelineConfig = {
    agencyId: string;
    verbose?: boolean;
};

export type Context = {
    db: Db;
    config: PipelineConfig;
    signal: AbortSignal;
    logger: pino.Logger;
    telemetry: {
        incr: (key: string, n?: number) => void;
        gauge: (key: string, value: number) => void;
    };
};

export function createContext(db: Db, config: PipelineConfig, signal?: AbortSignal): Context {
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
