import { Hono } from "hono";
import routesController from "./controller";

const routes = new Hono();

routesController(routes);

export default routes;
