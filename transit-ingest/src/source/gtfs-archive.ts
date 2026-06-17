import path from "node:path";
import fs from "node:fs";
import { tmpdir } from "node:os";
import AdmZip from "adm-zip";
import { err, ok, type Result } from "neverthrow";
import type { IngestError } from "../pipeline/core/error";
import pino from "pino";

export type SourceInfo = {
    dir: string;
    hash: string;
};

export async function downloadAndExtract(
    logger: pino.Logger,
    url: string,
): Promise<Result<SourceInfo, IngestError>> {
    const parentDir = path.join(tmpdir(), `gtfs-${Bun.randomUUIDv7()}`);
    const zipPath = path.join(parentDir, "archive.zip");
    const extractDir = path.join(parentDir, "extracted");

    try {
        logger.info({ url }, "Downloading GTFS archive");
        const resp = await fetch(url);
        if (!resp.ok) {
            logger.error({ url, status: resp.status }, "GTFS archive download failed");
            return err({
                severity: "fatal",
                code: "DOWNLOAD_FAILED",
                message: `HTTP ${resp.status} fetching ${url}`,
            });
        }

        fs.mkdirSync(parentDir, { recursive: true });

        const buffer = await resp.arrayBuffer();
        await Bun.write(zipPath, buffer);

        const hasher = new Bun.CryptoHasher("md5");
        for await (const chunk of Bun.file(zipPath).stream()) {
            hasher.update(chunk);
        }
        const hash = hasher.digest("hex");

        logger.debug({ extractDir }, "Extracting GTFS archive");
        new AdmZip(zipPath).extractAllTo(extractDir, true);

        fs.rmSync(zipPath);

        logger.info({ url, hash, extractDir }, "GTFS archive ready");

        return ok({ dir: extractDir, hash });
    } catch (e) {
        logger.error({ url, err: e }, "Failed to download or extract GTFS archive");

        if (fs.existsSync(parentDir)) {
            fs.rmSync(parentDir, { recursive: true, force: true });
        }
        return err({
            severity: "fatal",
            code: "ARCHIVE_ERROR",
            message: "Failed to download or extract GTFS archive",
            cause: e,
        });
    }
}
