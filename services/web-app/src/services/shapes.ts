import EndpointEnv from "~/constants/endpoint-env";

export const getShapeAsGeoJson = async (shapeId: string) => {
    const res = await fetch(`${EndpointEnv.GTFS_API_ENDPOINT}/shapes/${shapeId}/geojson`);
    const json = await res.json();
    return json;
};
