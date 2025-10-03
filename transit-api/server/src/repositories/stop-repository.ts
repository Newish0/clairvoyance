import { DataRepository } from "./data-repository";

export class StopRepository extends DataRepository {
    protected collectionName = "stops" as const;

    public async getGeoJson(agencyId: string, stopIds: string[]) {
        const stopCursor = this.db.collection("stops").find({
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
}
