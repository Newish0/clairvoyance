import { getDb } from "./mongo";

export const fetchShapeGeoJSON = async (shapeId: string) => {
    const db = await getDb();

    const shape = await db.collection("shapes").findOne({
        shape_id: shapeId,
    });

    return {
        type: "Feature",
        properties: { shapeId: shape?.shape_id, distances_traveled: shape?.distances_traveled },
        geometry: shape?.geometry,
    };
};
