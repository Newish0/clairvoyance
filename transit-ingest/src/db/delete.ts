import { sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sql";
import { err, ok, type Result } from "neverthrow";
import { type IngestError } from "../error.ts";

type Tx = Parameters<Parameters<ReturnType<typeof drizzle>["transaction"]>[0]>[0];

export async function deleteAll(tx: Tx): Promise<Result<void, IngestError>> {
    try {
        await tx.execute(sql`TRUNCATE transit.agencies CASCADE`);
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
