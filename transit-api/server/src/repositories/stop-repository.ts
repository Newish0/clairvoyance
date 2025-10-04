import { DataRepository } from "./data-repository";

export class StopRepository extends DataRepository {
    protected collectionName = "stops" as const;

    public async findGeoJson(agencyId: string, stopIds: string[]) {
        const stopCursor = this.db.collection(this.collectionName).find({
            agency_id: agencyId,
            stop_id: {
                $in: stopIds,
            },
        });

        const features = await stopCursor
            .map(
                (stop) =>
                    ({
                        type: "Feature",
                        properties: { stopId: stop.stop_id },
                        geometry: stop.location || null,
                    } as const)
            )
            .toArray();

        return {
            type: "FeatureCollection",
            features,
        } as const;
    }

    public async findNearbyStops(lat: number, lng: number, radius: number) {
        const nearbyStopsCursor = this.db.collection(this.collectionName).aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [lng, lat] },
                    distanceField: "distance",
                    maxDistance: radius,
                    spherical: true,
                    query: {},
                },
            },
            {
                $project: {
                    _id: 1,
                    stop_id: 1,
                    distance: 1,
                    stop_name: 1,
                },
            },
            {
                $sort: { distance: 1 },
            },
        ]);

        const nearbyStops: { _id: string; stop_id: string; distance: number; stop_name: string }[] =
            (await nearbyStopsCursor.toArray()) as any;

        return nearbyStops;
    }
}
