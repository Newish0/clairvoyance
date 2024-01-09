import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import transitController from "@/controllers/transit";

import { init as initGTFS } from "@/services/gtfs";

const app = new Hono();

// app.get('/', (c) => {
//   return c.text('Hello Hono!')
// })

const ASTRO_ROOT = "../dist/";

app.use(
    "/*",
    serveStatic({
        root: ASTRO_ROOT,
        onNotFound: (path, c) => {
            console.log(`${path} is not found, you access ${c.req.path}`);
        },
    })
);

transitController(app);

const port = 3000;
console.log(`Server is running on port ${port}`);

initGTFS();

serve({
    fetch: app.fetch,
    port,
});
