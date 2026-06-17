import { readFileSync } from "node:fs";
import { type } from "arktype";
import yaml from "js-yaml";
import type { Db } from "./db/client";
import { deleteAll } from "./db/delete";
import { runStaticPipeline, runRealtimePipeline, runRealizePipeline } from "./pipeline/run";

export interface ConfigPhases {
    static: boolean;
    realize: boolean;
    realtime: boolean;
}

const AgencyStaticConfig = type({
    url: "string",
    "ignoreFeedDup?": "boolean",
    "realizeInstances?": "boolean",
});

const AgencyRealtimeConfig = type({
    urls: "string[]",
    "poll?": "number",
});

const AgencyRealizeConfig = type({
    "minDate?": "string",
    "maxDate?": "string",
});

const AgencyConfig = type({
    id: "string",
    "static?": AgencyStaticConfig,
    "realtime?": AgencyRealtimeConfig,
    "realizeInstances?": AgencyRealizeConfig,
});

const AppConfigSchema = type({
    agencies: AgencyConfig.array(),
});

type AppConfig = typeof AppConfigSchema.infer;

function loadRawConfig(path: string): unknown {
    try {
        const raw = readFileSync(path, "utf-8");
        return yaml.load(raw);
    } catch (e) {
        console.error(`error: failed to read config - ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
    }
}

export async function runFromConfig(
    configPath: string,
    db: Db,
    deleteRows: boolean,
    verbose: boolean,
    pretty: boolean,
    phases: ConfigPhases = { static: true, realize: true, realtime: true },
): Promise<void> {
    const raw = loadRawConfig(configPath);
    const parsed = AppConfigSchema(raw);
    if (parsed instanceof type.errors) {
        console.error(`error: invalid config - ${parsed.summary}`);
        process.exit(1);
    }
    const config: AppConfig = parsed;

    // Delete all rows once before the loop (not per-agency, which would wipe prior agencies)
    if (deleteRows) {
        const result = await deleteAll(db);
        if (result.isErr()) {
            console.error(`error: failed to delete existing data - ${result.error.message}`);
            process.exit(1);
        }
    }

    // Phase 1: Static + realize per agency (sequential)
    if (phases.static || phases.realize) {
        for (const agency of config.agencies) {
            if (phases.static && agency.static) {
                await runStaticPipeline(
                    db,
                    agency.id,
                    agency.static.url,
                    false,
                    agency.static.ignoreFeedDup,
                    agency.static.realizeInstances,
                    verbose,
                    pretty
                );
            }
            if (phases.realize && agency.realizeInstances) {
                await runRealizePipeline(
                    db,
                    agency.id,
                    agency.realizeInstances.minDate,
                    agency.realizeInstances.maxDate,
                    verbose,
                    pretty
                );
            }
        }
    }

    // Phase 2: Realtime (concurrent)
    if (phases.realtime) {
        const realtimeAgencies = config.agencies.filter((a) => a.realtime);
        if (realtimeAgencies.length > 0) {
            const results = await Promise.allSettled(
                realtimeAgencies.map((agency) =>
                    runRealtimePipeline(
                        db,
                        agency.id,
                        agency.realtime!.urls,
                        agency.realtime!.poll ?? 0,
                        verbose,
                        pretty
                    ),
                ),
            );
            for (const result of results) {
                if (result.status === "rejected") {
                    console.error("error: realtime pipeline rejected:", result.reason);
                }
            }
        }
    }
}
