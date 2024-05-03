export function coordsToGeoJsonLine(latlngs: [number, number][]): GeoJSON.LineString {
    return {
        type: "LineString",
        coordinates: latlngs,
    };
}
