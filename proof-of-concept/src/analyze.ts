import fs from "fs";
import path from "path";
import { json2csv } from "json-2-csv";

const TMP_DATA_PATH = "./tmp_data";
const GEOJSON_PATH = path.join(TMP_DATA_PATH, "routes.geo.json");
const OUTPUT_CSV_PATH = path.join(TMP_DATA_PATH, "rtvp_95.csv");

const rtvpMap = new Map<string, any>();
const tripIds = JSON.parse(fs.readFileSync(path.join(TMP_DATA_PATH, "95_trip_ids.json"), "utf8"));

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
rtvp95 = rtvp95.filter(
    (data) =>
        haversineDistance([data.longitude, data.latitude], coords95.at(0)!) > 0.05 &&
        haversineDistance([data.longitude, data.latitude], coords95.at(-1)!) > 0.05
);

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

console.log(rtvp95);

const csv = json2csv(rtvp95);
fs.writeFileSync(OUTPUT_CSV_PATH, csv);
