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
import * as stopTimeUpdatesSchema from "./schemas/stop_time_updates";

const DEFAULT_CONFIG = {
    host: "localhost",
    port: "32769",
    user: "postgres",
    password: "postgrespw",
    database: "clairvoyance",
};

const config = {
    host: process.env.DB_HOST ?? DEFAULT_CONFIG.host,
    port: parseInt(process.env.DB_PORT ?? DEFAULT_CONFIG.port),
    user: process.env.DB_USER ?? DEFAULT_CONFIG.user,
    password: process.env.DB_PASSWORD ?? DEFAULT_CONFIG.password,
    database: process.env.DB_NAME ?? DEFAULT_CONFIG.database,
};

console.log(config);

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
        ...rtvpPolyRegrSchema,
        ...stopTimeUpdatesSchema,
    },
});

export default db;

export const migrateDb = async () => {
    const migrationClient = postgres({
        ...config,
        max: 1,
    });

    await migrate(drizzle(migrationClient), {
        migrationsFolder: path.resolve(import.meta.dirname, "drizzle"),
    });
};
