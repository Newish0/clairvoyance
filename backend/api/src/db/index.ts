import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import "dotenv/config";
import path from "path";

import * as tripsSchema from "./schemas/trips";
import * as routesSchema from "./schemas/routes";
import * as rtvpSchema from "./schemas/rtvp";
import * as shapesSchema from "./schemas/shapes";
import * as stopsSchema from "./schemas/stops";
import * as stoptimesSchema from "./schemas/stop_times";
import * as tripUpdatesSchema from "./schemas/trip_updates";
import * as rtvpPolyRegrSchema from "./schemas/rtvp_polyregr";

const config = {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
};

const queryClient = postgres({ ...config });
const db = drizzle(queryClient, {
    schema: {
        ...tripsSchema,
        ...routesSchema,
        ...rtvpSchema,
        ...shapesSchema,
        ...stopsSchema,
        ...stoptimesSchema,
        ...tripUpdatesSchema,
        ...rtvpPolyRegrSchema
    },
});

export default db;

export const migrateDb = async () => {
    const migrationClient = postgres({
        ...config,
        max: 1,
    });

    await migrate(drizzle(migrationClient), { migrationsFolder: path.resolve("drizzle") });
};
