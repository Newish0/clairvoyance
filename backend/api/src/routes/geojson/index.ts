import { Hono } from "hono";
import stopsGeojsonCtrl from "./controllers/stops";
import shapesGeojsonCtrl from "./controllers/shapes";

const geojson = new Hono();

stopsGeojsonCtrl(geojson);
shapesGeojsonCtrl(geojson);

export default geojson;
