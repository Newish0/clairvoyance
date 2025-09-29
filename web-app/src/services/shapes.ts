import { client } from "./client";

export const getShapeAsGeoJson = async (shapeId: string) => {
    // TODO: Error handling
    const res = await client.shapes({ shapeId }).geojson.get();
    return res.data;
};
