import { getDb } from "./mongo";

export const fetchRouteLiveVehicles = async (
    routeId: string,
    directionId?: 0 | 1,
    maxAge = 5 * 60 * 1000
) => {
    const db = await getDb();

    const dateFiveMinAgo = new Date(Date.now() - maxAge);

    const routeVehicles = await db
        .collection("scheduled_trips")
        .find({
            route_id: routeId,
            ...(directionId === undefined ? {} : { direction_id: directionId }),
            position_updated_at: { $gte: dateFiveMinAgo },
        })
        .toArray();

    return routeVehicles;
};
