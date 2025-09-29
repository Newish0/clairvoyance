interface Coordinates {
    lat: number;
    lon: number;
}

export function calculateHaversineDistance(
    coord1: Coordinates,
    coord2: Coordinates,
    unit: "km" | "m" = "km"
): number {
    const R = unit === "km" ? 6371 : 6371e3; // Earth's radius
    const dLat = toRadians(coord2.lat - coord1.lat);
    const dLon = toRadians(coord2.lon - coord1.lon);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(coord1.lat)) *
            Math.cos(toRadians(coord2.lat)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in specified unit (km or m)
}

function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}
