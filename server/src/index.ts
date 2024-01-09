import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import chalk from "chalk";

import { init as initGTFS } from "@/services/gtfs";
import api from "@/routes/api";

import pkgJson from "@/../package.json";

const app = new Hono();

const ASTRO_ROOT = "../dist/";

app.use("*", logger());

app.route("/api", api);

// Very important that the wildcard static files comes after other routes.
app.use(
    "/*",
    serveStatic({
        root: ASTRO_ROOT,
        onNotFound: (path, c) => {
            console.log(`${path} is not found, you access ${c.req.path}`);
        },
    })
);

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
