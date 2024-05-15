export function coordsToGeoJsonLine(
    latlngs: [number, number][]
): GeoJSON.Feature<GeoJSON.LineString> {
    const geoJSONLineString: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: latlngs,
        },
        properties: {},
    };


    // {
    //     "type": "Feature",
    //     "properties": {
    //         "route_id": "95-VIC",
    //         "route_short_name": "95",
    //         "route_long_name": "Langford / Downtown Blink",
    //         "route_type": 3,
    //         "route_color": "#FCAF17",
    //         "route_text_color": "#FFFFFF"
    //     },
    //     "geometry": {
    //         "type": "LineString",
    //         "coordinates": [
    //             [-123.46791, 48.44426],
    //             [-123.46796, 48.44407],
    //             [-123.4697, 48.44218],
    //             [-123.47118, 48.44262],
    //             [-123.47261, 48.4429],
    //             [-123.47592, 48.44399],
    //             [-123.47939, 48.44506]
    //         ]
    //     }
    // }
    return geoJSONLineString;
}
