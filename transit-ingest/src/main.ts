import { cac } from "cac";
import pino from "pino";
import { type, type as arkType } from "arktype";
import { getDb, type Db } from "./db/client";
import { createContext } from "./pipeline/core/context";
import { runStatic } from "./pipeline/gtfs-static";
import { runRealizeInstances } from "./pipeline/realize-instances";

const CliOptions = arkType({
    "databaseUrl?": "string | undefined",
    "deleteRows?": "boolean | undefined",
    "verbose?": "boolean | undefined",
});

const StaticOptions = CliOptions.merge({
    "realizeInstances?": "boolean | undefined",
    "ignoreFeedDup?": "boolean | undefined",
});

const DateStr = type("string | number")
    .pipe((v) => String(v))
    .narrow((s): s is string =>
        /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(s),
    );

const RealizeOptions = CliOptions.merge({
    "minDate?": DateStr,
    "maxDate?": DateStr,
});

function resolveDb(databaseUrl?: string): Db {
    if (!databaseUrl) {
        console.error("error: --database-url <url> or DATABASE_URL env var is required");
        process.exit(1);
    }
    return getDb(databaseUrl);
}

const cli = cac("transit-ingest");

cli.option("--database-url <url>", "Connection string for the database", {
    default: process.env.DATABASE_URL,
});
cli.option("--delete-rows", "Delete existing data before ingesting new data");
cli.option("--verbose, -v", "Enable debug logging");

cli.command("static <agency-id> <gtfs-url>", "Process static GTFS data")
    .option("--realize-instances", "Realize trip instances from GTFS static data")
    .option("--ignore-feed-dup", "Skip feed duplication check")
    .action(async (agencyId: string, gtfsUrl: string, options: unknown) => {
        const validated = StaticOptions(options);
        if (validated instanceof arkType.errors) {
            console.error(`error: invalid options - ${validated.summary}`);
            process.exit(1);
        }
        const log = pino({ level: validated.verbose ? "debug" : "info", name: "static" });
        const db = resolveDb(validated.databaseUrl);
        const ctx = createContext(db, { agencyId, verbose: !!validated.verbose });

        const result = await runStatic(
            ctx,
            gtfsUrl,
            validated.deleteRows,
            validated.ignoreFeedDup,
            validated.realizeInstances,
        );
        if (result.isErr()) {
            log.error({ err: result.error }, "Static processing failed");
            process.exit(1);
        }
        const summary = result.value;
        if (summary.errors.length > 0) {
            log.warn(
                { errors: summary.errors.length, skipped: summary.skipped },
                "Static data processed with recoverable errors",
            );
        } else {
            log.info("Static data processed successfully.");
        }
    });

cli.command("realtime <agency-id> <gtfs-urls...>", "Process realtime GTFS data")
    .option("--poll <seconds>", "Poll interval in seconds (0 = run once)")
    .action((agencyId: string, gtfsUrls: string[], options: unknown) => {
        const validated = CliOptions(options);
        if (validated instanceof arkType.errors) {
            console.error(`error: invalid options - ${validated.summary}`);
            process.exit(1);
        }
        const log = pino({ level: validated.verbose ? "debug" : "info", name: "realtime" });
        log.info(
            { agencyId, gtfsUrls, poll: (options as Record<string, unknown>).poll },
            "Realtime config",
        );
        log.info("Realtime data processed successfully.");
    });

cli.command(
    "realize-instances <agency-id>",
    "Realize trip instances from existing static GTFS data",
)
    .alias("realize")
    .option("--min-date <date>", "Minimum date (YYYYMMDD) for trip instances")
    .option("--max-date <date>", "Maximum date (YYYYMMDD) for trip instances")
    .action(async (agencyId: string, options: unknown) => {
        const validated = RealizeOptions(options);
        if (validated instanceof arkType.errors) {
            console.error(`error: invalid options - ${validated.summary}`);
            process.exit(1);
        }
        const log = pino({ level: validated.verbose ? "debug" : "info", name: "realize" });
        const db = resolveDb(validated.databaseUrl);
        const ctx = createContext(db, { agencyId, verbose: !!validated.verbose });

        const result = await runRealizeInstances(ctx, validated.minDate, validated.maxDate);
        if (result.isErr()) {
            log.error({ err: result.error }, "Realize instances failed");
            process.exit(1);
        }
        const summary = result.value;
        if (summary.errors.length > 0) {
            log.warn(
                { errors: summary.errors.length, skipped: summary.skipped },
                "Realize instances completed with recoverable errors",
            );
        } else {
            log.info("Realize instances completed successfully.");
        }
    });

cli.help();

try {
    // Parse CLI args without running the command
    cli.parse(process.argv, { run: false });

    if (!cli.matchedCommand) {
        console.error(`error: unknown command`);
        cli.outputHelp();
        process.exit(1);
    }

    await cli.runMatchedCommand();
} catch (error: any) {
    console.error(error.message);
    cli.outputHelp();
    process.exit(1);
}
