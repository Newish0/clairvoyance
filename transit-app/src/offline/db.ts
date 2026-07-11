import { PGliteWorker as PGliteWorkerWrapper } from "@electric-sql/pglite/worker";
import type { Db } from "database";
import { schemaRelations } from "database/models/relations";
import { drizzle } from "drizzle-orm/pglite";
import PGLiteWorker from "./pglite-worker?worker";
import type { PGlite } from "@electric-sql/pglite";

let _dbPromise: Promise<Db> | null = null;

export const getDb = async (): Promise<Db> => {
    if (_dbPromise) return _dbPromise;

    _dbPromise = (async () => {
        const pg = await PGliteWorkerWrapper.create(new PGLiteWorker(), {
            id: "transit-pglite",
        });
        return drizzle({
            // HACK: drizzle-orm typing doesn't support PGliteWorker but they should have the same API
            client: pg as unknown as PGlite,
            relations: schemaRelations,
        });
    })();

    return _dbPromise;
};

export type PGliteDb = Db<PGlite>;
