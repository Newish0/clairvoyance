import { defineRelations } from "drizzle-orm";
import * as tables from "./tables";
import * as views from "./views";

export const schemaRelations = defineRelations(
    {
        ...tables,
        ...views,
    },
    (r) => ({
        trips: {
            agency: r.one.agencies({
                from: r.trips.agencyId,
                to: r.agencies.id,
            }),
            route: r.one.routes({
                from: r.trips.routeId,
                to: r.routes.id,
            }),
            shape: r.one.shapes({
                from: r.trips.shapeId,
                to: r.shapes.id,
            }),
            stopTimes: r.many.stopTimes({
                from: r.trips.id,
                to: r.stopTimes.tripId,
            }),
        },
        stopTimes: {
            trip: r.one.trips({
                from: r.stopTimes.tripId,
                to: r.trips.id,
            }),
            stop: r.one.stops({
                from: r.stopTimes.stopId,
                to: r.stops.id,
            }),
        },
        tripInstances: {
            trip: r.one.trips({
                from: r.tripInstances.tripId,
                to: r.trips.id,
            }),
            vehicle: r.one.vehicles({
                from: r.tripInstances.vehicleId,
                to: r.vehicles.id,
            }),
            stopTimeInstances: r.many.stopTimeInstances({
                from: r.tripInstances.id,
                to: r.stopTimeInstances.tripInstanceId,
            }),
            positions: r.many.vehiclePositions({
                from: r.tripInstances.id,
                to: r.vehiclePositions.tripInstanceId,
            }),
            shape: r.one.shapes({
                from: r.tripInstances.shapeId,
                to: r.shapes.id,
            }),
        },
        stopTimeInstances: {
            tripInstance: r.one.tripInstances({
                from: r.stopTimeInstances.tripInstanceId,
                to: r.tripInstances.id,
            }),
            stopTime: r.one.stopTimes({
                from: r.stopTimeInstances.stopTimeId,
                to: r.stopTimes.id,
            }),
            stop: r.one.stops({
                from: r.stopTimeInstances.stopId,
                to: r.stops.id,
            }),
        },
        stopTimeRealtimeInstances: {
            stop: r.one.stops({
                from: r.stopTimeRealtimeInstances.stopId,
                to: r.stops.id,
            }),
        },
        vehiclePositions: {
            tripInstance: r.one.tripInstances({
                from: r.vehiclePositions.tripInstanceId,
                to: r.tripInstances.id,
            }),
        },
        alerts: {},
        activeAlerts: {},
        stops: {
            stopRoute: r.one.stopRoutes({
                from: r.stops.id,
                to: r.stopRoutes.stopId,
            }),
        },
        routes: {},
        agencies: {},
    }),
);
