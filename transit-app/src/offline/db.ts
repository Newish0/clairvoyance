import { PGliteWorker as PGliteWorkerWrapper } from "@electric-sql/pglite/worker";
import type { Db } from "database";
import { schemaRelations } from "database/models/relations";
import { drizzle } from "drizzle-orm/pglite";
import PGLiteWorker from "./pglite-worker?worker";

let _db: Db | null = null;

export const getDb = async (): Promise<Db> => {
    if (_db) {
        return _db;
    }

    const pg = await PGliteWorkerWrapper.create(new PGLiteWorker(), {
        id: "transit-pglite",
    });

    const db = drizzle({
        client: pg as any,
        relations: schemaRelations,
    });

    _db = db;

    return db;
};
