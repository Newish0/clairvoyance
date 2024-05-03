import { Hono } from "hono";
import shapesController from "./controller";

const shapes = new Hono();

shapesController(shapes);

export default shapes;
