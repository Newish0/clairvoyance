import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import chalk from "chalk";

import { init as initGTFS } from "@/services/gtfs";
import api from "@/routes/api";

import pkgJson from "@/../package.json";

const app = new Hono();

app.use("*", logger());
app.use(
    "/api/*",
    cors({
        origin: ["http://localhost:4321"],
    })
);

app.route("/api", api);

const port = 3000;

initGTFS();

// Server startup logging
console.log();
console.log(
    chalk.white.bold.bgGreen(` ${pkgJson.displayName || pkgJson.name} `),
    chalk.green(`v${pkgJson.version}`)
);
console.log();
console.log(`┃ Local    ${chalk.cyan.underline(`http://localhost:${port}`)}`);
console.log();

serve({
    fetch: app.fetch,
    port,
});
