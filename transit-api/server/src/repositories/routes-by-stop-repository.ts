import { ObjectId } from "mongodb";
import { DataRepository } from "./data-repository";
import type { FeatureCollection } from "geojson";
import { TransitDb } from "../database/mongo";
import { StopRepository } from "./stop-repository";
import { RouteRepository } from "./route-repository";

export class RoutesByStopRepository extends DataRepository {
    private stopRepository: StopRepository;
    private routeRepository: RouteRepository;

    constructor(db: TransitDb) {
        super(db);

        this.stopRepository = new StopRepository(db);
        this.routeRepository = new RouteRepository(db);
    }

    public async findNearbyRoutesByStop(
        query:
            | {
                  stopObjectId: string;
              }
            | {
                  agencyId: string;
                  stopId: string;
              },
        radiusMeters = 100
    ) {
        const stop = await ("stopObjectId" in query
            ? this.stopRepository.findById(query.stopObjectId)
            : this.stopRepository.findStop(query.agencyId, query.stopId));

        if (!stop?.location) {
            return [];
        }

        const nearbyStops = await this.stopRepository.findNearbyStops({
            lng: stop.location.coordinates[0],
            lat: stop.location.coordinates[1],
            radius: radiusMeters,
        });

        const nearbyStopIds = nearbyStops.map(({ _id }) => new ObjectId(_id));

        const nearbyRoutesByStops = await this.db
            .collection(this.collectionName)
            .find({
                stop: {
                    $in: nearbyStopIds as any, // HACK: Need to fix underlying TS types from type gen
                },
            })
            .toArray();

        const routeIds = nearbyRoutesByStops
            .map(({ routes }) => routes.map((r) => r.toString()))
            .flat();

        const uniqueRouteIds = [...new Set(routeIds)];

        const routes = await Promise.all(
            uniqueRouteIds.map((id) => this.routeRepository.findById(id))
        );

        const result = routes.filter((r) => !!r);

        return result;
    }
}
