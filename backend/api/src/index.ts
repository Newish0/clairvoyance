import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import chalk from "chalk";

import pkgJson from "@/../package.json";
import stops from "./routes/stops";
import geojson from "./routes/geojson";
import routes from "./routes/routes";
import trips from "./routes/trips";

import { migrateDb } from "clairvoyance-db";
import pgDB from "clairvoyance-db";
import shapes from "./routes/shapes";
import rtvp from "./routes/rtvp";
import transits from "./routes/transits";
import stoptimes from "./routes/stoptimes";

/** Whether we are ready to serve data */
let ready = false;

const app = new Hono();

app.use("*", logger());
app.use(
    "*",
    cors({
        origin: ["http://localhost:4321"],
    })
);

// Serves error 500 if not ready
app.use("*", async (c, next) => {
    if (ready) return await next();
    else {
        c.status(500);
        return c.json({ message: "API Not Ready" });
    }
});

// API Routes
app.route("/stops", stops);
app.route("/geojson", geojson);
app.route("/routes", routes);
app.route("/trips", trips);
app.route("/shapes", shapes);
app.route("/rtvp", rtvp);
app.route("/transits", transits);
app.route("/stoptimes", stoptimes);

const port = parseInt(process.env.PORT || "3000");

// Server startup logging
console.log();
console.log(
    chalk.white.bold.bgGreen(` ${pkgJson.displayName || pkgJson.name} `),
    chalk.green(`v${pkgJson.version}`)
);
console.log();
console.log(`┃ Local    ${chalk.cyan.underline(`http://localhost:${port}`)}`);
console.log();

const criticalInit = async () => {
    console.log();
    console.log(chalk.white.bold.bgYellow(`Migrating DB`));
    await migrateDb();
    console.log(chalk.white.bold.bgCyan(`DB Migration Complete`));
};

const nonCriticalInit = async () => {
    // Non critical initialization
    console.log(chalk.white.bold.bgYellow(`Initializing GTFS`));
    // TODO
    console.log(chalk.white.bold.bgCyan(`GTFS Initialization Complete`));

    console.log(chalk.white.bold.bgYellow(`Syncing GTFS`));
    // TODO
    console.log(chalk.white.bold.bgCyan(`GTFS Sync Complete`));
};

// Initialization process
(async () => {
    await criticalInit();
    ready = true;
    console.log(chalk.white.bold.bgGreen(`Server Ready`));
    await nonCriticalInit();
})();

serve({
    fetch: app.fetch,
    port,
});
