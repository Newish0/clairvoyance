/**
 * Limit the bbox to at most n degrees in any dimension.
 * That is, it is clamped to n / 2 degree from the center of the bbox in each dimension.
 * Handles negative coordinates and antimeridian wrapping.
 */
export const limitBBox = (
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    n: number
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
