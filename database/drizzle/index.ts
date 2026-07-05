import { schemaRelations } from "./models/relations";
import * as tables from "./models/tables";
import * as views from "./models/views";

import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

const schema = { ...tables, ...views };
export type Db = PgAsyncDatabase<PgQueryResultHKT, typeof schema, typeof schemaRelations>;

export * from "./models";
