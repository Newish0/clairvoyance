export const getShapeAsGeoJson = async (shapeId: string) => {
    const res = await fetch(
        `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/shapes/${shapeId}/geojson`
    );
    const json = await res.json();
    return json;
};
