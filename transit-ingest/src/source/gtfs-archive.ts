import path from "node:path";
import fs from "node:fs";
import { tmpdir } from "node:os";
import AdmZip from "adm-zip";
import { err, ok, type Result } from "neverthrow";
import type { IngestError } from "../error.ts";

export type SourceInfo = {
    dir: string;
    hash: string;
};

export async function downloadAndExtract(url: string): Promise<Result<SourceInfo, IngestError>> {
    const extractDir = path.join(tmpdir(), `gtfs-${Bun.randomUUIDv7()}`, "extracted");

    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            return err({
                severity: "fatal",
                code: "DOWNLOAD_FAILED",
                message: `HTTP ${resp.status} fetching ${url}`,
            });
        }

        const zipBytes = Buffer.from(await resp.arrayBuffer());

        const hasher = new Bun.CryptoHasher("md5");
        hasher.update(zipBytes);
        const hash = hasher.digest("hex");

        new AdmZip(zipBytes).extractAllTo(extractDir, true);

        return ok({ dir: extractDir, hash });
    } catch (e) {
        return err({
            severity: "fatal",
            code: "ARCHIVE_ERROR",
            message: "Failed to download or extract GTFS archive",
            cause: e,
        });
    }
}
