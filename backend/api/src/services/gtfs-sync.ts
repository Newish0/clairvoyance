import pgDb from "clairvoyance-db";
import { trips as tripsTable } from "clairvoyance-db/schemas/trips";
import { routes as routesTable } from "clairvoyance-db/schemas/routes";
import { realtime_vehicle_position as rtvpTable } from "clairvoyance-db/schemas/rtvp";
import { shapes as shapesTable } from "clairvoyance-db/schemas/shapes";
import { stops as stopsTable } from "clairvoyance-db/schemas/stops";
import { stop_times as stoptimesTable } from "clairvoyance-db/schemas/stop_times";
import { calendar_dates as calendarDatesTable } from "clairvoyance-db/schemas/calendar_dates";

import { importGtfs, InsertionType } from "gtfs-parser";

const agencies = ["https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48"];

export async function syncGtfs() {
    let numCall = 0;

    for (const agency of agencies) {
        await importGtfs({
            url: agency,
            async insertFunc(type, data) {
                numCall++;
                // console.log(numCall)
                switch (type) {
                    case InsertionType.Shapes:
                        await insertShapes(data);
                        break;
                    case InsertionType.StopTimes:
                        await insertStopTimes(data);
                        break;
                    case InsertionType.Stops:
                        await insertStops(data);
                        break;
                    case InsertionType.Trips:
                        await insertTrips(data);
                        break;
                    case InsertionType.Routes:
                        await insertRoutes(data);
                        break;
                    case InsertionType.TripUpdates:
                        await insertTripUpdates(data);
                        break;
                    case InsertionType.VehiclePositions:
                        await insertVehiclePositions(data);
                        break;
                    case InsertionType.CalendarDates:
                        await insertCalendarDates(data);
                        break;
                    default:
                        throw new Error(`Unsupported insertion type: ${type}`);
                }

                async function insertShapes(data: any) {
                    await pgDb
                        .insert(shapesTable)
                        .values(data)
                        .onConflictDoUpdate({
                            target: [shapesTable.shape_id, shapesTable.shape_pt_sequence],
                            set: data,
                        });
                }

                async function insertStopTimes(data: any) {
                    await pgDb
                        .insert(stoptimesTable)
                        .values(data)
                        .onConflictDoUpdate({
                            target: [stoptimesTable.trip_id, stoptimesTable.stop_sequence],
                            set: data,
                        });
                }

                async function insertStops(data: any) {
                    await pgDb
                        .insert(stopsTable)
                        .values(data)
                        .onConflictDoUpdate({
                            target: [stopsTable.stop_id],
                            set: data,
                        });
                }

                async function insertTrips(data: any) {
                    await pgDb
                        .insert(tripsTable)
                        .values(data)
                        .onConflictDoUpdate({
                            target: [tripsTable.trip_id],
                            set: data,
                        });
                }

                async function insertRoutes(data: any) {
                    await pgDb
                        .insert(routesTable)
                        .values(data)
                        .onConflictDoUpdate({
                            target: [routesTable.route_id],
                            set: data,
                        });
                }

                async function insertTripUpdates(data: any) {
                    // Ignore
                }

                async function insertVehiclePositions(data: any) {
                    // Ignore
                }

                async function insertCalendarDates(data: any) {
                    await pgDb
                        .insert(calendarDatesTable)
                        .values(data)
                        .onConflictDoUpdate({
                            target: [calendarDatesTable.service_id, calendarDatesTable.date],
                            set: data,
                        });
                }
            },
        });
    } // for 
}
