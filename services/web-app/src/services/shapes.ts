import EndpointEnv from "~/constants/endpoint-env";
import { client } from "./client";

export const getShapeAsGeoJson = async (shapeId: string) => {
    // const res = await fetch(`${EndpointEnv.GTFS_API_ENDPOINT}/shapes/${shapeId}/geojson`);
    // const json = await res.json();
    // return json;

    // TODO: Error handling
    const res = await client.shapes({ shapeId }).geojson.get();
    return res.data;
};
