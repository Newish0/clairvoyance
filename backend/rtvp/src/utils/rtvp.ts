import { RawRTVP } from "@/types/rtvp";
import { realtime_vehicle_position as rtvpTable } from "@/db/schemas/rtvp";
import { trips as tripsTable } from "@/db/schemas/trips";
import defaultDb from "@/db";
import { eq, gte, and, asc } from "drizzle-orm";
import { shapes as shapesTable } from "@/db/schemas/shapes";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js/driver";

const parseRawRtvpTimestamp = (rawRtvpTimestamp: string | undefined): Date => {
    return rawRtvpTimestamp ? new Date(parseInt(rawRtvpTimestamp) * 1000) : new Date();
};

export const isDuplicate = async (
    rawRtvp: RawRTVP,
    db: PostgresJsDatabase<Record<string, never>> = defaultDb
): Promise<boolean> => {
    const timestamp = parseRawRtvpTimestamp(rawRtvp.timestamp);

    const rtvps = await db
        .select()
        .from(rtvpTable)
        .where(
            and(
                eq(rtvpTable.timestamp, timestamp),
                eq(rtvpTable.trip_id, rawRtvp.trip_id),
                eq(rtvpTable.vehicle_id, rawRtvp.vehicle_id)
            )
        );

    if (rtvps.length > 0) return true;

    return false;
};

export const transformRtvp = async (
    rawRtvp: RawRTVP,
    maxIntervalBtwTrips = 12 * 3600 * 1000,
    db: PostgresJsDatabase<Record<string, never>> = defaultDb
): Promise<typeof rtvpTable.$inferInsert> => {
    const { trip_id } = rawRtvp;
    const timestamp = parseRawRtvpTimestamp(rawRtvp.timestamp);

    const trip = (
        await defaultDb.select().from(tripsTable).where(eq(tripsTable.trip_id, trip_id)).limit(1)
    ).at(0);

    if (!trip) throw new Error(`No trip found for trip_id: ${trip_id}`);

    if (!trip.shape_id) throw new Error(`No shape_id found for trip_id: ${trip_id}`);

    const shapes = await db
        .select()
        .from(shapesTable)
        .where(eq(shapesTable.shape_id, trip.shape_id));

    const lineCoords = shapes
        .toSorted((a, b) => a.shape_pt_sequence - b.shape_pt_sequence)
        .map((shape) => [shape.shape_pt_lon, shape.shape_pt_lat] as [number, number]);

    const p_traveled =
        rawRtvp.longitude && rawRtvp.latitude
            ? percentageAlongLine(lineCoords, [rawRtvp.longitude, rawRtvp.latitude])
            : undefined;

    // TODO: Validate tripRootRtvp logic and refactor
    const tripRootRtvp = (
        await db
            .select()
            .from(rtvpTable)
            .where(
                and(
                    eq(rtvpTable.trip_id, trip_id),
                    gte(rtvpTable.timestamp, new Date(timestamp.getTime() - maxIntervalBtwTrips))
                )
            )
            .orderBy(asc(rtvpTable.timestamp))
            .limit(1)
    ).at(0);

    const rel_timestamp = tripRootRtvp
        ? timestamp.getTime() - tripRootRtvp?.timestamp.getTime()
        : 0;

    return {
        bearing: rawRtvp.bearing,
        latitude: rawRtvp.latitude,
        longitude: rawRtvp.longitude,
        speed: rawRtvp.speed,
        trip_id,
        vehicle_id: rawRtvp.vehicle_id,
        timestamp,
        is_updated: rawRtvp.is_updated ?? 0,
        p_traveled,
        rel_timestamp,
    };
};

/**
 *
 * @param point1
 * @param point2
 * @returns distance in KM
 */
function haversineDistance(point1: [number, number], point2: [number, number]): number {
    const R = 6371; // Radius of the Earth in kilometers
    const lat1 = (Math.PI / 180) * point1[1];
    const lat2 = (Math.PI / 180) * point2[1];
    const dLat = lat2 - lat1;
    const dLon = (Math.PI / 180) * (point2[0] - point1[0]);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    return distance;
}

function findNearestPoint(
    targetPoint: [number, number],
    points: [number, number][]
): [number, number] {
    /**
     * Find the nearest point to the target point from a list of points.
     */
    let nearest: [number, number] | null = null;
    let minDistance = Infinity;
    for (const point of points) {
        const dist = haversineDistance(targetPoint, point);
        if (dist < minDistance) {
            minDistance = dist;
            nearest = point;
        }
    }
    if (nearest === null) {
        throw new Error("No points provided");
    }
    return nearest;
}

function percentageAlongLine(
    linePoints: [number, number][],
    pointNearLine: [number, number]
): number {
    const nearestPoint = findNearestPoint(pointNearLine, linePoints);
    const index = linePoints.indexOf(nearestPoint);

    let nearestNeighbor: null | [number, number] = null;
    let nearestNeighborIndex = -1;
    const neighbor1 = linePoints.at(index + 1);
    const neighbor2 = linePoints.at(index - 1);

    if (neighbor1 && !neighbor2) {
        nearestNeighbor = neighbor1;
        nearestNeighborIndex = index + 1;
    } else if (!neighbor1 && neighbor2) {
        nearestNeighbor = neighbor2;
        nearestNeighborIndex = index - 1;
    } else if (
        haversineDistance(neighbor1!, pointNearLine) < haversineDistance(neighbor2!, pointNearLine)
    ) {
        nearestNeighbor = neighbor1!;
        nearestNeighborIndex = index + 1;
    } else {
        nearestNeighbor = neighbor2!;
        nearestNeighborIndex = index - 1;
    }

    const [x1, y1] = nearestPoint;
    const [x2, y2] = nearestNeighbor;
    const [x, y] = pointNearLine;

    // Vector representing the line segment
    const segmentVectorX = x2 - x1;
    const segmentVectorY = y2 - y1;

    // Vector from the line segment's start point to the given point
    const pointVectorX = x - x1;
    const pointVectorY = y - y1;

    // Calculate the dot product of the vectors
    const dotProduct = pointVectorX * segmentVectorX + pointVectorY * segmentVectorY;

    // Calculate the square of the length of the line segment
    const segmentLengthSquared = segmentVectorX * segmentVectorX + segmentVectorY * segmentVectorY;

    // Calculate parameter t
    let t = dotProduct / segmentLengthSquared;

    // Clamp t to ensure the closest point lies within the line segment
    t = Math.max(0, Math.min(1, t));

    // Coordinates of the closest point
    const closestPointX = x1 + t * segmentVectorX;
    const closestPointY = y1 + t * segmentVectorY;

    // Find total distance over the entire route
    let totalDistance = 0;
    for (let i = 1; i < linePoints.length; i++) {
        totalDistance += haversineDistance(linePoints[i - 1], linePoints[i]);
    }

    // Find distance traveled along route at this point in time
    const minIndex = Math.min(nearestNeighborIndex, index);
    let distanceTraveled = 0;
    for (let i = 1; i < minIndex; i++) {
        distanceTraveled += haversineDistance(linePoints[i - 1], linePoints[i]);
    }
    distanceTraveled += haversineDistance(linePoints[minIndex], [closestPointX, closestPointY]);

    return distanceTraveled / totalDistance;
}
