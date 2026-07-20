/**
 * Limit the bbox to at most n degrees in any dimension.
 * That is, it is clamped to n / 2 degree from the center of the bbox in each dimension.
 * Handles negative coordinates and antimeridian wrapping.
 */
export const limitBBox = (
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    n: number,
) => {
    // Normalize longitudes to [-180, 180]
    const normalizeLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

    let minLat = Math.max(-90, bbox.minLat);
    let maxLat = Math.min(90, bbox.maxLat);

    let minLng = normalizeLng(bbox.minLng);
    let maxLng = normalizeLng(bbox.maxLng);

    // Handle case where bbox crosses the antimeridian
    let lngDiff = maxLng - minLng;
    if (lngDiff < 0) lngDiff += 360;

    const latDiff = maxLat - minLat;

    const latCenter = (minLat + maxLat) / 2;
    let lngCenter = normalizeLng(minLng + lngDiff / 2);

    const halfLimit = n / 2;

    // Clamp latitude and longitude extents
    const halfLat = Math.min(latDiff / 2, halfLimit);
    const halfLng = Math.min(lngDiff / 2, halfLimit);

    let newMinLat = Math.max(-90, latCenter - halfLat);
    let newMaxLat = Math.min(90, latCenter + halfLat);

    let newMinLng = normalizeLng(lngCenter - halfLng);
    let newMaxLng = normalizeLng(lngCenter + halfLng);

    // Handle wraparound again if needed
    if (newMaxLng < newMinLng) {
        // Bbox crosses the antimeridian; represent it consistently
        [newMinLng, newMaxLng] = [newMaxLng, newMinLng + 360];
        newMinLng = normalizeLng(newMinLng);
        newMaxLng = normalizeLng(newMaxLng);
    }

    return {
        minLat: newMinLat,
        maxLat: newMaxLat,
        minLng: newMinLng,
        maxLng: newMaxLng,
    };
};

/**
 * Check if a point falls within a bounding box.
 * Bbox format: [[west, south], [east, north]] - matches LngLatBounds#toArray()
 * ponytail: antimeridian crossing not handled
 */
export function isPointInBbox(
    point: { lat: number; lng: number },
    bbox: [[number, number], [number, number]],
): boolean {
    const [[west, south], [east, north]] = bbox;
    return point.lng >= west && point.lng <= east && point.lat >= south && point.lat <= north;
}

/**
 * Get distance between two coordinates in km
 */
export const haversine = (
    coord1: { lat: number; lng: number },
    coord2: { lat: number; lng: number },
): number => {
    const R = 6371;

    const lat1Rad = (coord1.lat * Math.PI) / 180;
    const lat2Rad = (coord2.lat * Math.PI) / 180;
    const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

export const METERS_PER_DEGREE_LAT = 111_320;

export const metersPerDegreeLon = (latitude: number) =>
    METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180);

export function bboxSizeMeters(bbox: [[number, number], [number, number]]) {
    const [[west, south], [east, north]] = bbox;
    const midLatRad = ((south + north) / 2) * (Math.PI / 180);
    return {
        width: (east - west) * METERS_PER_DEGREE_LAT * Math.cos(midLatRad),
        height: (north - south) * METERS_PER_DEGREE_LAT,
    };
}
