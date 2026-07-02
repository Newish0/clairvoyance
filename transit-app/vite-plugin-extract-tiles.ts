import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { TileManifestSchema, assertManifestAgrees } from "./scripts/tile-manifest";

interface ExtractTilesOptions {
    outputDir: string;
    dirName: string;
}

export function extractTiles({ outputDir, dirName }: ExtractTilesOptions): Plugin {
    const absOutput = resolve(outputDir);
    const manifestPath = resolve(absOutput, dirName, "manifest.json");

    return {
        name: "extract-tiles",
        async buildStart() {
            if (!existsSync(manifestPath)) {
                this.error(`manifest not found: ${manifestPath}`);
                return;
            }

            try {
                execSync("pmtiles version", { stdio: "ignore" });
            } catch {
                this.warn(
                    "pmtiles CLI not found - install from https://github.com/protomaps/go-pmtiles/releases",
                );
                return;
            }

            let parsed;
            try {
                const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
                parsed = TileManifestSchema.parse(raw);
                assertManifestAgrees(parsed, dirName);
            } catch (e: any) {
                this.error(`manifest validation failed: ${e.message}`);
                return;
            }

            const { source, worldBase, datasets } = parsed;

            const jobs = [
                {
                    input: source,
                    output: resolve(absOutput, worldBase.tiles),
                    maxZoom: worldBase.extractMaxZoom,
                    label: "world-base",
                },
                ...datasets.map((ds: any) => ({
                    input: source,
                    output: resolve(absOutput, ds.tiles),
                    bbox: [ds.bbox.minLon, ds.bbox.minLat, ds.bbox.maxLon, ds.bbox.maxLat],
                    maxZoom: ds.maxZoom,
                    label: ds.id,
                })),
            ];

            for (const job of jobs) {
                if (existsSync(job.output)) {
                    this.info(`tiles: skip ${job.label} (exists)`);
                    continue;
                }

                const args = [`"${job.input}"`, `"${job.output}"`];
                if ("bbox" in job) args.push(`--bbox=${job.bbox.join(",")}`);
                if (job.maxZoom) args.push(`--maxzoom=${job.maxZoom}`);

                this.info(`tiles: extract ${job.label}...`);
                try {
                    execSync(`pmtiles extract ${args.join(" ")}`, { stdio: "inherit" });
                } catch {
                    this.error(`tiles: failed to extract ${job.label}`);
                }
            }
        },
    };
}
