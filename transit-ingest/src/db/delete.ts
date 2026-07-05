import { sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { type IngestError } from "../pipeline/core/error";
import type { Db } from "database";

export async function deleteAll(db: Db): Promise<Result<void, IngestError>> {
    try {
        await db.execute(sql`TRUNCATE transit.agencies CASCADE`);
        return ok();
    } catch (e) {
        return err({
            severity: "fatal",
            code: "DELETE_ALL_FAILED",
            message: "Failed to delete all data",
            cause: e,
        });
    }
}
