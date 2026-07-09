import { PGliteWorker as PGliteWorkerWrapper } from "@electric-sql/pglite/worker";
import type { Db } from "database";
import { schemaRelations } from "database/models/relations";
import { drizzle } from "drizzle-orm/pglite";
import PGLiteWorker from "./pglite-worker?worker";

let _dbPromise: Promise<Db> | null = null;

export const getDb = async (): Promise<Db> => {
    if (_dbPromise) return _dbPromise;

    _dbPromise = (async () => {
        const pg = await PGliteWorkerWrapper.create(new PGLiteWorker(), {
            id: "transit-pglite",
        });
        return drizzle({ client: pg as any, relations: schemaRelations });
    })();

    return _dbPromise;
};
