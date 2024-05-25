import { realtime_vehicle_position as rtvpTable } from "clairvoyance-db/schemas/rtvp";
import { trips as tripsTable } from "clairvoyance-db/schemas/trips";
import defaultDb from "clairvoyance-db";
import { eq, gte, and, asc, sql, inArray, lte } from "drizzle-orm";
import { shapes as shapesTable } from "clairvoyance-db/schemas/shapes";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js/driver";
import regression from "regression";
import { trip_updates as tripUpdatesTable } from "clairvoyance-db/schemas/trip_updates";

const parseRawRtvpTimestamp = (rawRtvpTimestamp: string | undefined): Date => {
    return rawRtvpTimestamp ? new Date(parseInt(rawRtvpTimestamp) * 1000) : new Date();
};

/**
 * Formats a Date object into a string in the format YYYYMMDD.
 * @param date The Date object to format.
 * @returns The formatted date string in YYYYMMDD format.
 */
function formatDateToString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-indexed
    const day = String(date.getDate()).padStart(2, "0");

    const dateString = `${year}${month}${day}`;

    return dateString;
}

export const isDuplicate = async (
    rtvp: { timestamp: Date; trip_id: string; vehicle_id: string },
    db: typeof defaultDb = defaultDb
): Promise<boolean> => {
    const rtvps = await db
        .select()
        .from(rtvpTable)
        .where(
            and(
                eq(rtvpTable.timestamp, rtvp.timestamp),
                eq(rtvpTable.trip_id, rtvp.trip_id),
                eq(rtvpTable.vehicle_id, rtvp.vehicle_id)
            )
        );

    return rtvps.length > 0;
};

export async function computeVehiclePTravelled(
    tripId: string,
    lat: number,
    lng: number,
    db: typeof defaultDb = defaultDb
) {
    const trip = await db.query.trips.findFirst({
        where: (t, { eq }) => eq(t.trip_id, tripId),
    });

    if (!trip || !trip.shape_id) {
        return null;
    }

    const shapes = await db.query.shapes.findMany({
        where: (s, { eq }) => eq(s.shape_id, trip.shape_id!),
        orderBy: (s, { asc }) => asc(s.shape_pt_sequence),
    });

    const lineCoords = shapes
        .toSorted((a, b) => a.shape_pt_sequence - b.shape_pt_sequence)
        .map((shape) => [shape.shape_pt_lon, shape.shape_pt_lat] as [number, number]);

    const p_traveled = lng && lat ? percentageAlongLine(lineCoords, [lng, lat]) : undefined;

    return p_traveled;
}

// export const transformRtvp = async (
//     rawRtvp: RawRTVP,
//     tripUpdateMatch: {
//         start_date: string;
//         trip_start_time: string;
//     },
//     db: typeof defaultDb = defaultDb
// ): Promise<typeof rtvpTable.$inferInsert> => {
//     const { trip_id } = rawRtvp;
//     const timestamp = parseRawRtvpTimestamp(rawRtvp.timestamp);

//     const tripUpdate = await defaultDb.query.tripUpdates.findFirst({
//         where: and(
//             eq(tripUpdatesTable.trip_id, trip_id),
//             eq(tripUpdatesTable.start_date, tripUpdateMatch.start_date),
//             lte(tripUpdatesTable.trip_start_time, tripUpdateMatch.trip_start_time)
//         ),
//     });

//     if (!tripUpdate) throw new Error(`No trip update found for trip_id: ${trip_id} at this time`);

//     const trip = (
//         await defaultDb.select().from(tripsTable).where(eq(tripsTable.trip_id, trip_id)).limit(1)
//     ).at(0);

//     if (!trip) throw new Error(`No trip found for trip_id: ${trip_id}`);

//     if (!trip.shape_id) throw new Error(`No shape_id found for trip_id: ${trip_id}`);

//     const shapes = await db
//         .select()
//         .from(shapesTable)
//         .where(eq(shapesTable.shape_id, trip.shape_id));

//     const lineCoords = shapes
//         .toSorted((a, b) => a.shape_pt_sequence - b.shape_pt_sequence)
//         .map((shape) => [shape.shape_pt_lon, shape.shape_pt_lat] as [number, number]);

//     const p_traveled =
//         rawRtvp.longitude && rawRtvp.latitude
//             ? percentageAlongLine(lineCoords, [rawRtvp.longitude, rawRtvp.latitude])
//             : undefined;

//     return {
//         bearing: rawRtvp.bearing,
//         latitude: rawRtvp.latitude,
//         longitude: rawRtvp.longitude,
//         speed: rawRtvp.speed,
//         trip_id,
//         vehicle_id: rawRtvp.vehicle_id,
//         timestamp,
//         is_updated: rawRtvp.is_updated ?? 0,
//         p_traveled,
//         trip_update_id: tripUpdate.trip_update_id,
//         // rel_timestamp,
//     };
// };

// const findElementWithAverageGreaterThanNextThree = (arr: number[]): number | undefined => {
//     // Iterate through the array until the third-to-last element
//     for (let i = 0; i <= arr.length - 4; i++) {
//         // Calculate the sum of the current element and the next 3 elements
//         const sumNextThree = arr[i] + arr[i + 1] + arr[i + 2] + arr[i + 3];

//         // Calculate the average of these elements
//         const averageNextThree = sumNextThree / 4;

//         // Check if the average is greater than the current element
//         if (averageNextThree > arr[i]) {
//             // Return the index of the first element that satisfies the condition
//             return i;
//         }
//     }

//     // Return undefined if no such element is found
//     return undefined;
// };

// const tripRootRtvpCache = new Map<string, typeof rtvpTable.$inferSelect | null>();

// const findTripRootRtvp = async (
//     rtvp: typeof rtvpTable.$inferSelect,
//     maxIntervalBtwTrips = 12 * 3600 * 1000,
//     nearStartThreshold = [0.005, 0.02],
//     db: typeof defaultDb = defaultDb
// ) => {
//     if (!rtvp.trip_id) return null;

//     const key = `${rtvp.trip_id}-${maxIntervalBtwTrips}-${nearStartThreshold.join("-")}`;

//     if (tripRootRtvpCache.has(key)) {
//         return tripRootRtvpCache.get(key)!;
//     }

//     const tripRootRtvpCandidates = await db
//         .select()
//         .from(rtvpTable)
//         .where(
//             and(
//                 eq(rtvpTable.trip_id, rtvp.trip_id),

//                 // Trip must be within time frame
//                 gte(rtvpTable.timestamp, new Date(rtvp.timestamp.getTime() - maxIntervalBtwTrips)),

//                 // Ignore trips near start of route
//                 gte(rtvpTable.p_traveled, nearStartThreshold[0]),
//                 lte(rtvpTable.p_traveled, nearStartThreshold[1])
//             )
//         )
//         .orderBy(asc(rtvpTable.timestamp));

//     const index = findElementWithAverageGreaterThanNextThree(
//         tripRootRtvpCandidates.map((rtvp) => rtvp.p_traveled ?? 0)
//     );

//     if (index !== undefined) {
//         const tripRootRtvp = tripRootRtvpCandidates.at(index) ?? null;
//         tripRootRtvpCache.set(key, tripRootRtvp);
//         return tripRootRtvp;
//     } else {
//         tripRootRtvpCache.set(key, null);
//         return null;
//     }
// };

// /**
//  * Computes the polynomial coefficients for a given route and direction.
//  *
//  * @param routeId - The ID of the route.
//  * @param directionId - The ID of the direction.
//  * @param db - The Drizzle Client instance.
//  * @returns The polynomial coefficients for the route and direction i.e. `c[i] * x^(n - i) ...`.
//  */
// export const computePredictionPolynomial = async (
//     routeId: string,
//     directionId: number,
//     db: typeof defaultDb = defaultDb
// ) => {
//     // Get the trip IDs for the given route and direction.
//     const tripIds = (
//         await db
//             .select({ trip_id: tripsTable.trip_id })
//             .from(tripsTable)
//             .where(and(eq(tripsTable.route_id, routeId), eq(tripsTable.direction_id, directionId)))
//     ).map(({ trip_id }) => trip_id);

//     if (tripIds.length === 0) return null;

//     // Get the realtime vehicle positions (RTVPs) for the trip IDs.
//     const tripRtvpResults = await db.query.realtime_vehicle_position.findMany({
//         where: (rtvp, { inArray }) => inArray(rtvp.trip_id, tripIds),
//         with: {
//             tripUpdate: true,
//         },
//     });

//     // Add the elapsed time to each RTVP.
//     const tripRtvpWithElapsed: (typeof rtvpTable.$inferSelect & {
//         elapsed: number | null;
//     })[] = tripRtvpResults
//         .map((rtvp) => {
//             let elapsed: number | null = null;

//             if (rtvp.tripUpdate.trip_start_timestamp) {
//                 elapsed = Math.round(
//                     (rtvp.timestamp.getTime() - rtvp.tripUpdate.trip_start_timestamp?.getTime()) /
//                         1000
//                 );
//             }

//             return {
//                 ...rtvp,
//                 elapsed,
//             };
//         })
//         .filter((rtvp) => rtvp.elapsed !== null);

//     return polynomialRegression(tripRtvpWithElapsed, "p_traveled", "elapsed",6);
// };

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

function polynomialRegression(
    data: any[],
    independentVariable: string,
    dependentVariable: string,
    degree: number
) {
    // Perform polynomial regression
    const result = regression.polynomial(
        data.map((point) => [point[independentVariable], point[dependentVariable]]),
        { order: degree, precision: 32 }
    );

    return result;
}
