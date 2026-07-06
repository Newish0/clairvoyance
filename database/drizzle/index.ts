import { schemaRelations } from "./models/relations";

import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type Db = PgAsyncDatabase<PgQueryResultHKT, typeof schemaRelations>;

export * from "./models";
