export * from "./tables";
export * from "./enums";
export * from "./relations";
export * from "./views";
export * from "./schema";

// import { drizzle } from "drizzle-orm/bun-sql";
// import * as tables from "./tables.ts";
// import * as views from "./views.ts";
// import { schemaRelations } from "./relations.ts";
// import { SQL } from "bun";

// const client = new SQL(process.env.DATABASE_URL!);

// export const db = drizzle({ client, schema: {...tables, ...views}, relations: schemaRelations});

