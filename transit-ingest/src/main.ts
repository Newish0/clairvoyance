import { cac } from "cac";
import pino from "pino";
import { getDb, type Db } from "./db/client";
import { createContext } from "./pipeline/core/context";
import { runStatic } from "./pipeline/gtfs-static";


type CliOptions = {
    databaseUrl?: string;
    deleteRows?: boolean;
    verbose?: boolean;
};

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
    .action((agencyId: string, gtfsUrl: string, options: CliOptions) => {
        const log = pino({ level: options.verbose ? "debug" : "info", name: "static" });
        const db = resolveDb(options.databaseUrl as string | undefined);
        const ctx = createContext(db, { agencyId, verbose: !!options.verbose });

        runStatic(ctx, gtfsUrl, options.deleteRows).then((result) => {
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
    });

cli.command("realtime <agency-id> <gtfs-urls...>", "Process realtime GTFS data")
    .option("--poll <seconds>", "Poll interval in seconds (0 = run once)")
    .action((agencyId: string, gtfsUrls: string[], options: Record<string, unknown>) => {
        const log = pino({ level: options.verbose ? "debug" : "info", name: "realtime" });
        log.info({ agencyId, gtfsUrls, poll: options.poll }, "Realtime config");
        log.info("Realtime data processed successfully.");
    });

cli.command(
    "realize-instances <agency-id>",
    "Realize trip instances from existing static GTFS data",
)
    .alias("realize")
    .option("--min-date <date>", "Minimum date (YYYYMMDD) for trip instances")
    .option("--max-date <date>", "Maximum date (YYYYMMDD) for trip instances")
    .action((agencyId: string, options: Record<string, unknown>) => {
        const log = pino({ level: options.verbose ? "debug" : "info", name: "realize" });
        log.info(
            { agencyId, minDate: options.minDate, maxDate: options.maxDate },
            "Realize config",
        );
        log.info("Realize instances processing complete.");
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
