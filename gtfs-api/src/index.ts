import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import chalk from "chalk";

import { init as initGTFS } from "@/services/gtfs";
import api from "@/routes/api";

import pkgJson from "@/../package.json";

/** Whether we are ready to serve data */
let ready = false;

const app = new Hono();

app.use("*", logger());
app.use(
    "/api/*",
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

app.route("/api", api);

const port = parseInt(process.env.PORT || "3000");

initGTFS().then(() => (ready = true));

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
