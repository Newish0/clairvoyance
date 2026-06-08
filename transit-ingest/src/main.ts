import { cac } from "cac";
import { type } from "arktype";
import {
    resolveDb,
    runStaticPipeline,
    runRealtimePipeline,
    runRealizePipeline,
} from "./pipeline/run";

const CliOptions = type({
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
    .narrow((s): s is string => /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(s));

const RealtimeOptions = CliOptions.merge({
    "poll?": "string | number | undefined",
});

const RealizeOptions = CliOptions.merge({
    "minDate?": DateStr,
    "maxDate?": DateStr,
});

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
        if (validated instanceof type.errors) {
            console.error(`error: invalid options - ${validated.summary}`);
            process.exit(1);
        }
        const db = resolveDb(validated.databaseUrl);
        await runStaticPipeline(
            db,
            agencyId,
            gtfsUrl,
            validated.deleteRows ?? false,
            validated.ignoreFeedDup,
            validated.realizeInstances,
            !!validated.verbose,
        );
    });

cli.command("realtime <agency-id> <...gtfs-urls>", "Process realtime GTFS data")
    .option("--poll <seconds>", "Poll interval in seconds (0 = run once)", { default: 0 })
    .action(async (agencyId: string, gtfsUrls: string[], options: unknown) => {
        const validated = RealtimeOptions(options);
        if (validated instanceof type.errors) {
            console.error(`error: invalid options - ${validated.summary}`);
            process.exit(1);
        }
        const db = resolveDb(validated.databaseUrl);
        await runRealtimePipeline(
            db,
            agencyId,
            gtfsUrls,
            Number(validated.poll ?? 0),
            !!validated.verbose,
        );
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
        if (validated instanceof type.errors) {
            console.error(`error: invalid options - ${validated.summary}`);
            process.exit(1);
        }
        const db = resolveDb(validated.databaseUrl);
        await runRealizePipeline(
            db,
            agencyId,
            validated.minDate,
            validated.maxDate,
            !!validated.verbose,
        );
    });

cli.command("from-config <config-file>", "Run pipeline from a YAML config file").action(
    async (configFile: string, options: unknown) => {
        const validated = CliOptions(options);
        if (validated instanceof type.errors) {
            console.error(`error: invalid options - ${validated.summary}`);
            process.exit(1);
        }
        const db = resolveDb(validated.databaseUrl);
        const { runFromConfig } = await import("./config");
        await runFromConfig(
            configFile,
            db,
            validated.deleteRows ?? false,
            !!validated.verbose,
        );
    },
);

cli.help();

try {
    // Handle --help explicitly since { run: false } suppresses CAC's built-in help handler
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
        cli.outputHelp();
        process.exit(0);
    }

    cli.parse(process.argv, { run: false });

    if (!cli.matchedCommand) {
        console.error(`error: unknown command`);
        cli.outputHelp();
        process.exit(1);
    }

    await cli.runMatchedCommand();
} catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(msg);
    cli.outputHelp();
    process.exit(1);
}
