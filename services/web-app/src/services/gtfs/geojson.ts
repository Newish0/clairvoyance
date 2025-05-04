import { calculateHaversineDistance } from "~/utils/distance";
import { getShapes } from "./shapes";
import { getTripStops } from "./stops";
import { cubicInterpolation, pointsToLineString } from "~/utils/shapes";

export async function getTripGeojson(tripId: string, stopId: string, numIntermediatePoints = 0) {
    const [shapes, tripStops] = await Promise.all([getShapes(tripId), getTripStops(tripId)]);

    const yourStop = tripStops.find((ts) => ts.stop_id === stopId);

    if (!yourStop) {
        throw new Error(
            `Given stop ID ${stopId} does not exist in the list of stops trip ${tripId} passes through`
        );
    }

    let closestShapePoint = shapes.shape_points.at(0);
    let minDist = Infinity;
    for (const shapePoint of shapes.shape_points) {
        const d = calculateHaversineDistance(
            {
                lat: yourStop.stop_lat,
                lon: yourStop.stop_lon,
            },
            {
                lat: shapePoint.lat,
                lon: shapePoint.lon,
            }
        );

        if (d < minDist) {
            closestShapePoint = shapePoint;
            minDist = d;
        }
    }

    if (!closestShapePoint) {
        throw new Error(`There exist no shape point that is close to the given stop.`);
    }

    // Both includes shape point closest to stop
    const beforeStopShapePoints = shapes.shape_points.filter(
        (sp) => sp.sequence <= closestShapePoint.sequence
    );
    const afterStopShapePoints = shapes.shape_points.filter(
        (sp) => sp.sequence >= closestShapePoint.sequence
    );

    // Convert to GeoJSONs
    const beforeGeojson = pointsToLineString(
        cubicInterpolation(beforeStopShapePoints, numIntermediatePoints)
    );
    const afterGeojson = pointsToLineString(
        cubicInterpolation(afterStopShapePoints, numIntermediatePoints)
    );

    const transformedStops = tripStops.map((stop) => ({
        ...stop,
        isYourStop: stop.stop_id === stopId,
        hasPassed: stop.stop_sequence < yourStop.stop_sequence,
    }));

    return {
        before: beforeGeojson,
        after: afterGeojson,
        stops: transformedStops,
        tripId,
        stopId,
    };
}
