import { execSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const VERSION = "1.30.3";
const REPO = "protomaps/go-pmtiles";

function plat(): string {
    switch (process.platform) {
        case "win32":
            return "Windows";
        case "darwin":
            return "Darwin";
        default:
            return "Linux";
    }
}

function cpu(): string {
    switch (process.arch) {
        case "x64":
            return "x86_64";
        case "arm64":
            return "arm64";
        default:
            throw new Error(`unsupported arch: ${process.arch}`);
    }
}

function assetName(): string {
    const p = plat();
    const ext = p === "Windows" ? "zip" : "tar.gz";
    const sep = p === "Darwin" ? "-" : "_";
    return `go-pmtiles${sep}${VERSION}_${p}_${cpu()}.${ext}`;
}

async function main() {
    const binDir = resolve(ROOT, "node_modules/.bin");
    const binName = plat() === "Windows" ? "pmtiles.exe" : "pmtiles";
    const dest = resolve(binDir, binName);

    if (existsSync(dest)) {
        try {
            execSync(`"${dest}" version`, { stdio: "ignore" });
            console.log("pmtiles CLI already installed");
            return;
        } catch {}
        console.log("pmtiles binary broken, re-installing...");
    }

    if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

    const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${assetName()}`;
    const tmp = resolve(binDir, "_pmtiles.tmp");

    console.log(`Downloading pmtiles v${VERSION} for ${plat()}/${cpu()}...`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`download failed (${resp.status}): ${url}`);
    writeFileSync(tmp, Buffer.from(await resp.arrayBuffer()));

    console.log("Extracting...");
    const p = plat();
    const extractCmd =
        p === "Windows" ? `tar -xf "${tmp}" -C "${binDir}"` : `tar -xzf "${tmp}" -C "${binDir}"`;
    execSync(extractCmd, { stdio: "ignore" });

    unlinkSync(tmp);
    try {
        chmodSync(dest, 0o755);
    } catch {}
    console.log("pmtiles CLI installed at", dest);
}

await main();
