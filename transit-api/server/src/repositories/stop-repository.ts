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

    public async findNearbyStops(
        params:
            | { lat: number; lng: number } & (
                  | { radius: number }
                  | {
                        bbox: {
                            minLat: number;
                            maxLat: number;
                            minLng: number;
                            maxLng: number;
                        };
                    }
              )
    ) {
        const nearbyStopsCursor = this.db.collection(this.collectionName).aggregate([
            "radius" in params
                ? {
                      $geoNear: {
                          near: { type: "Point", coordinates: [params.lng, params.lat] },
                          distanceField: "distance",
                          maxDistance: params.radius,
                          spherical: true,
                          query: {},
                      },
                  }
                : {
                      $match: {
                          location: {
                              $geoWithin: {
                                  $box: [
                                      [params.bbox.minLng, params.bbox.minLat], // southwest
                                      [params.bbox.maxLng, params.bbox.maxLat], // northeast
                                  ],
                              },
                          },
                      },
                  },
            {
                $project: {
                    _id: 1,
                    stop_id: 1,
                    distance: 1,
                    stop_name: 1,
                    location: 1,
                },
            },
            {
                $sort: { distance: 1 },
            },
        ]);

        const nearbyStops: {
            _id: string;
            stop_id: string;
            distance: number;
            stop_name: string;
            location: { type: string; coordinates: [number, number] };
        }[] = (await nearbyStopsCursor.toArray()) as any;

        return nearbyStops;
    }
}
