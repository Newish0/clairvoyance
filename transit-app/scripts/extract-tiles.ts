import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TileManifestSchema, assertManifestAgrees } from "./tile-manifest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function parseArgs() {
    const args = process.argv.slice(2);
    const get = (flag: string, fallback: string) => {
        const idx = args.indexOf(flag);
        return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
    };

    const outputDir = resolve(ROOT, get("--output-dir", "public"));
    const dirName = get("--dir-name", "pmtiles");
    return {
        outputDir,
        dirName,
        manifest: resolve(outputDir, dirName, "manifest.json"),
        force: args.includes("--force"),
    };
}

function checkCli() {
    try {
        execSync("pmtiles version", { stdio: "ignore" });
    } catch {
        console.error(
            "pmtiles CLI not found. Install from https://github.com/protomaps/go-pmtiles/releases",
        );
        process.exit(1);
    }
}

function runPmtiles(args: string[]) {
    const cmd = args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ");
    try {
        execSync(`pmtiles ${cmd}`, { stdio: "inherit" });
    } catch {
        throw new Error(`pmtiles failed: ${args[0]}`);
    }
}

function extractTiles(manifestPath: string, outputDir: string, dirName: string, force: boolean) {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    const parsed = TileManifestSchema.parse(raw);
    assertManifestAgrees(parsed, dirName);
    const { source, worldBase, datasets } = parsed;

    const jobs = [
        {
            input: source,
            output: resolve(outputDir, worldBase.tiles),
            maxZoom: worldBase.extractMaxZoom,
            label: "world-base",
        },
        ...datasets.map((ds) => ({
            input: source,
            output: resolve(outputDir, ds.tiles),
            bbox: [ds.bbox.minLon, ds.bbox.minLat, ds.bbox.maxLon, ds.bbox.maxLat],
            maxZoom: ds.maxZoom,
            label: ds.id,
        })),
    ];

    for (const job of jobs) {
        if (!force && existsSync(job.output)) {
            console.log(`  skip ${job.label} (exists)`);
            continue;
        }

        const args = ["extract", job.input, job.output];
        if ("bbox" in job) args.push(`--bbox=${job.bbox.join(",")}`);
        if (job.maxZoom) args.push(`--maxzoom=${job.maxZoom}`);

        console.log(`  extract ${job.label}...`);
        runPmtiles(args);
    }
}

const { manifest, outputDir, dirName, force } = parseArgs();

if (!existsSync(manifest)) {
    console.error(`manifest not found: ${manifest}`);
    process.exit(1);
}

checkCli();
console.log("Extracting tiles...");
extractTiles(manifest, outputDir, dirName, force);
console.log("Done.");
