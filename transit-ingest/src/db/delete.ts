import { sql } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { type IngestError } from "../error.ts";
import type { Db } from "./client.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

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
