import fs from "fs";
import path from "path";
import { json2csv } from "json-2-csv";
import * as math from "mathjs";

import regression from "regression";

const TMP_DATA_PATH = "./tmp_data";
const GEOJSON_PATH = path.join(TMP_DATA_PATH, "routes.geo.json");
const OUTPUT_CSV_PATH = path.join(TMP_DATA_PATH, "rtvp_95.csv");

const rtvpMap = new Map<string, any>();
const tripIds = JSON.parse(fs.readFileSync(path.join(TMP_DATA_PATH, "95_trip_ids.json"), "utf8"));



// TODO. Instead of using GEO JSON and approx distance traveled 
//       Using the shape_id of the trip/route and thus => Shapes table to get shapes coordinates


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

interface DataPoint {
    [key: string]: number;
}

function polynomialRegression(
    data: DataPoint[],
    independentVariable: string,
    dependentVariable: string,
    degree: number
): number[] {
    // Perform polynomial regression
    const result = regression.polynomial(
        data.map((point) => [point[independentVariable], point[dependentVariable]]),
        { order: degree, precision: 32 }
    );

    // Retrieve coefficients of the regression equation
    const coefficients: number[] = result.equation;

    return coefficients;
}

// Read all files in the directory
fs.readdirSync(TMP_DATA_PATH).forEach((file) => {
    // Check if the file matches the specified pattern
    if (file.startsWith("rtvp_") && file.endsWith(".json")) {
        // Extract timestamp from the file name
        const timestamp = file.substring(5, file.indexOf(".json"));

        // Read file data
        const filePath = path.join(TMP_DATA_PATH, file);
        const fileData = fs.readFileSync(filePath, "utf8");

        // Store data in the map
        rtvpMap.set(timestamp, JSON.parse(fileData));
    }
});

let rtvp95: any[] = [];

// Add time stamp to data
rtvpMap.forEach((rtvpList, timestamp) => {
    rtvp95.push(
        ...rtvpList
            .filter((rtvp: any) => tripIds.includes(rtvp.trip_id))
            .map((rtvp: any) => ({ ...rtvp, timestamp: parseInt(timestamp) }))
    );
});

// Find coordinates that makes up the 95 route/line
const geoJson = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
const features95 = geoJson.features.filter(
    ({ properties }: any) => properties.route_short_name == 95
);

const coords95: [number, number][] = [];

// Join GEOJSON into one single route (formed by many line segments).
for (let i = 0; i < features95.length; i++) {
    for (const feat of features95) {
        if (!Array.isArray(feat.geometry.coordinates)) continue;

        if (!coords95.length) {
            coords95.push(...feat.geometry.coordinates);
            continue;
        }

        const featStart = feat.geometry.coordinates.at(0);
        const featEnd = feat.geometry.coordinates.at(-1);
        const coordStart = coords95.at(0)!;
        const coordEnd = coords95.at(-1)!;

        if (haversineDistance(featStart, coordEnd) < 0.001) {
            coords95.push(...feat.geometry.coordinates);
        } else if (haversineDistance(featEnd, coordStart) < 0.001) {
            coords95.splice(0, 0, ...feat.geometry.coordinates);
        }
    }
}

fs.writeFileSync(path.join(TMP_DATA_PATH, "test.json"), JSON.stringify(coords95));

// Add percentage traveled along route to data
rtvp95.forEach(
    (data) => (data.percentage = percentageAlongLine(coords95, [data.longitude, data.latitude]))
);

// Remove data point when near start or end
rtvp95 = rtvp95.filter((data) => data.percentage > 0.0001);

// Remove trips that did not get it's entire trip recorded.
const tripsWithNearStart: Record<string, boolean> = {};
rtvp95.forEach((data) => {
    if (haversineDistance([data.longitude, data.latitude], coords95.at(0)!) < 0.1)
        tripsWithNearStart[data.trip_id] = true;
});
rtvp95 = rtvp95.filter((data) => tripsWithNearStart[data.trip_id]);

// Add a relative time
const tripStartTimeRec: Record<string, number> = {};
rtvp95.forEach((data) => {
    if (!tripStartTimeRec[data.trip_id]) tripStartTimeRec[data.trip_id] = data.timestamp;
    else tripStartTimeRec[data.trip_id] = Math.min(data.timestamp, tripStartTimeRec[data.trip_id]);
});

rtvp95.forEach((data) => (data.rel_timestamp = data.timestamp - tripStartTimeRec[data.trip_id]));

// Filter by observing points at similar rel_timestamp

// const sortedRelTime = rtvp95.map((data) => data.rel_timestamp).toSorted((a, b) => a - b);
// const rtQ1 = sortedRelTime[Math.floor(sortedRelTime.length * 0.25)];
// const rtQ3 = sortedRelTime[Math.ceil(sortedRelTime.length * 0.75)];
// const rtIQR = rtQ3 - rtQ1;
// const rtLower = rtQ1 - 1.5 * rtIQR;
// const rtUpper = rtQ3 + 1.5 * rtIQR;

const bucketRange = 10000; // Defines what is consider to be near another point

// const numRTInRange = rtvp95.filter(
//     (data) => data.rel_timestamp > rtLower && data.rel_timestamp < rtUpper
// ).length;
// const numRTPerBucket = numRTInRange / bucketSize;

const outliersPointCountByTrip: Record<string, number> = {};

rtvp95.forEach((d1) => {
    if (!outliersPointCountByTrip[d1.trip_id]) outliersPointCountByTrip[d1.trip_id] = 0;

    //  Find all points that are near the current point
    const similarRelTimePoints = rtvp95.filter(
        (d2) => Math.abs(d2.rel_timestamp - d1.rel_timestamp) < bucketRange
    );

    // // Must contain at least 10%  of expect num points in a bucket to be valid
    // if (similarRelTimePoints.length < numRTPerBucket * 0.1) {
    //     outliersPointCountByTrip[d1.trip_id]++;
    //     return;
    // }

    const avgPer = math.mean(similarRelTimePoints.map((d2) => d2.percentage));

    // Must be within 0.1 percentage traveled to be close enough to cluster
    if (Math.abs(avgPer - d1.percentage) > 0.1) {
        outliersPointCountByTrip[d1.trip_id]++;
    }
});

// Count the number of points each trip has
const pointsPerTrip: Record<string, number> = {};
rtvp95.forEach((d) => {
    if (!pointsPerTrip[d.trip_id]) pointsPerTrip[d.trip_id] = 0;
    pointsPerTrip[d.trip_id]++;
});

// No more than 25% of the points of the trip can be outliers
const threshold = 0.25;
rtvp95 = rtvp95.filter(
    (d) => outliersPointCountByTrip[d.trip_id] < pointsPerTrip[d.trip_id] * threshold
);


console.log(rtvp95);

// Perform polynomial regression, remove outlier with residual.
// NOTE: We use regression to best fit a polynomial for data extrapolation use.
//       When in use, we will have both x, y var.
//        1. Compute prediction given X
//        2. We offset polynomial to match prediction with our known y.
//        3. We compute again for the predicted y using offset polynomial.
const initialCoeff = polynomialRegression(rtvp95, "rel_timestamp", "percentage", 6);

console.log(initialCoeff);

const csv = json2csv(rtvp95);
fs.writeFileSync(OUTPUT_CSV_PATH, csv);
