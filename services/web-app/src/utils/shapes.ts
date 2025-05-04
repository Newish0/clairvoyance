import type { ShapePoint } from "~/services/gtfs/types";

interface GeoJsonPoint {
    type: "Feature";
    geometry: {
        type: "Point";
        coordinates: [number, number];
    };
    properties: {
        sequence: number;
        distTraveled?: number;
    };
}

interface GeoJsonLineString {
    type: "Feature";
    geometry: {
        type: "LineString";
        coordinates: [number, number][];
    };
    properties: {
        pointCount: number;
    };
}

/**
 * Converts an array of ShapePoints to a GeoJSON LineString
 */
export function pointsToLineString(points: ShapePoint[]): GeoJsonLineString {
    const sortedPoints = [...points].sort((a, b) => a.sequence - b.sequence);

    return {
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: sortedPoints.map((p) => [p.lon, p.lat]),
        },
        properties: {
            pointCount: points.length,
        },
    };
}

/**
 * Converts an array of ShapePoints to GeoJSON Point features
 */
export function pointsToGeoJsonPoints(points: ShapePoint[]): GeoJsonPoint[] {
    return points.map((p) => ({
        type: "Feature",
        geometry: {
            type: "Point",
            coordinates: [p.lon, p.lat],
        },
        properties: {
            sequence: p.sequence,
            distTraveled: p.dist_traveled,
        },
    }));
}

/**
 * Performs cubic interpolation between points to create a smoother line
 * @param points Original array of ShapePoints
 * @param numIntermediatePoints Number of points to interpolate between each pair of original points
 * @returns Array of interpolated points including original points
 */
export function cubicInterpolation(
    points: ShapePoint[],
    numIntermediatePoints: number = 10
): ShapePoint[] {
    if (points.length < 4) {
        return points; // Need at least 4 points for cubic interpolation
    }

    const result: ShapePoint[] = [];

    // Helper function to calculate cubic interpolation
    function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
        const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
        const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
        const c = -0.5 * p0 + 0.5 * p2;
        const d = p1;

        return a * t * t * t + b * t * t + c * t + d;
    }

    // Add first point
    result.push(points[0]);

    // Interpolate between each pair of points
    for (let i = 0; i < points.length - 3; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const p2 = points[i + 2];
        const p3 = points[i + 3];

        // Create intermediate points
        for (let j = 1; j <= numIntermediatePoints; j++) {
            const t = j / numIntermediatePoints;

            const lat = cubic(p0.lat, p1.lat, p2.lat, p3.lat, t);
            const lon = cubic(p0.lon, p1.lon, p2.lon, p3.lon, t);

            // Calculate approximate distance traveled (linear interpolation)
            let dist_traveled: number | undefined;
            if (p1.dist_traveled !== undefined && p2.dist_traveled !== undefined) {
                dist_traveled = p1.dist_traveled + (p2.dist_traveled - p1.dist_traveled) * t;
            }

            result.push({
                lat,
                lon,
                sequence: p1.sequence + t,
                dist_traveled,
            });
        }

        // Add the next original point (except for the last iteration)
        if (i < points.length - 4) {
            result.push(points[i + 1]);
        }
    }

    // Add last three points
    result.push(points[points.length - 3]);
    result.push(points[points.length - 2]);
    result.push(points[points.length - 1]);

    return result;
}
