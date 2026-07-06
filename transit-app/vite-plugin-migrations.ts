import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import type { Plugin, Rollup } from "vite";

interface Migration {
    id: string;
    sql: string;
}

interface DrizzleMigrationsOptions {
    /** Absolute path to the directory containing the timestamped migration folders. */
    migrationsDir: string;
    /** Absolute path to the output JSON file. */
    outputPath: string;
}

function isInsideDir(dir: string, filePath: string): boolean {
    const rel = relative(dir, filePath);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function drizzleMigrations(options: DrizzleMigrationsOptions): Plugin {
    const { migrationsDir, outputPath: outFile } = options;

    function generate(ctx: Rollup.PluginContext): void {
        if (!existsSync(migrationsDir)) {
            ctx.warn(`[drizzle-migrations] migrations dir not found: ${migrationsDir}`);
            return;
        }

        const entries = readdirSync(migrationsDir, { withFileTypes: true }).filter(
            (d) => d.isDirectory() && /^\d{14}_/.test(d.name),
        );
        entries.sort((a, b) => a.name.localeCompare(b.name));

        const migrations: Migration[] = [];

        for (const entry of entries) {
            const sqlPath = resolve(migrationsDir, entry.name, "migration.sql");
            if (!existsSync(sqlPath)) continue;
            const id = entry.name.slice(0, 14);
            const sql = readFileSync(sqlPath, "utf-8");
            migrations.push({ id, sql });
        }

        mkdirSync(dirname(outFile), { recursive: true });
        writeFileSync(outFile, JSON.stringify(migrations, null, 2));

        ctx.info(
            `[drizzle-migrations] generated ${outFile}` +
                ` (${migrations.length} migrations, ${Buffer.byteLength(JSON.stringify(migrations), "utf-8")} bytes)`,
        );
    }

    return {
        name: "drizzle-migrations",
        buildStart() {
            generate(this);
        },
        watchChange(id) {
            if (isInsideDir(migrationsDir, id)) {
                generate(this);
            }
        },
        configureServer(server) {
            server.watcher.add(migrationsDir);
        },
    };
}
