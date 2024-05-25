import pgDb from "clairvoyance-db";
import { trips as tripsTable } from "clairvoyance-db/schemas/trips";
import { routes as routesTable } from "clairvoyance-db/schemas/routes";
import { realtime_vehicle_position as rtvpTable } from "clairvoyance-db/schemas/rtvp";
import { shapes as shapesTable } from "clairvoyance-db/schemas/shapes";
import { stops as stopsTable } from "clairvoyance-db/schemas/stops";
import { stop_times as stoptimesTable } from "clairvoyance-db/schemas/stop_times";
import { calendar_dates as calendarDatesTable } from "clairvoyance-db/schemas/calendar_dates";

import { importGtfs, InsertionType } from "gtfs-parser";
import { getSecondsFromHHMMSS } from "@/utils/datetime";

const agencies = ["https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48"];

function parseIntUndefinedForNaN(value: string): number | undefined {
    const int = parseInt(value);
    return isNaN(int) ? undefined : int;
}
function parseFloatUndefinedForNaN(value: string): number | undefined {
    const int = parseFloat(value);
    return isNaN(int) ? undefined : int;
}

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

                async function insertShapes(data: Record<string, string>) {
                    const transformedData = {
                        shape_id: data.shape_id,
                        shape_pt_lat: parseFloat(data.shape_pt_lat),
                        shape_pt_lon: parseFloat(data.shape_pt_lon),
                        shape_pt_sequence: parseInt(data.shape_pt_sequence),
                        shape_dist_traveled: parseIntUndefinedForNaN(data.shape_dist_traveled),
                    };

                    await pgDb
                        .insert(shapesTable)
                        .values(transformedData)
                        .onConflictDoUpdate({
                            target: [shapesTable.shape_id, shapesTable.shape_pt_sequence],
                            set: transformedData,
                        });
                }

                async function insertStopTimes(data: Record<string, string>) {
                    const transformedData = {
                        trip_id: data.trip_id,
                        arrival_time: data.arrival_time,
                        departure_time: data.departure_time,
                        arrival_timestamp: getSecondsFromHHMMSS(data.arrival_time),
                        departure_timestamp: getSecondsFromHHMMSS(data.departure_time),
                        stop_id: data.stop_id,
                        stop_sequence: parseInt(data.stop_sequence),
                        stop_headsign: data.stop_headsign,
                        pickup_type: parseIntUndefinedForNaN(data.pickup_type),
                        drop_off_type: parseIntUndefinedForNaN(data.drop_off_type),
                        shape_dist_traveled: parseIntUndefinedForNaN(data.shape_dist_traveled),
                        timepoint: parseIntUndefinedForNaN(data.timepoint),

                        // Ignored `continuous_drop_off`, `continuous_pickup`
                    };

                    await pgDb
                        .insert(stoptimesTable)
                        .values(transformedData)
                        .onConflictDoUpdate({
                            target: [stoptimesTable.trip_id, stoptimesTable.stop_sequence],
                            set: transformedData,
                        });
                }

                async function insertStops(data: Record<string, string>) {
                    const transformedData = {
                        stop_id: data.stop_id,
                        stop_name: data.stop_name,
                        stop_lat: parseFloat(data.stop_lat),
                        stop_lon: parseFloat(data.stop_lon),
                        zone_id: data.zone_id,
                        stop_url: data.stop_url,
                        location_type: parseIntUndefinedForNaN(data.location_type),
                        parent_station: data.parent_station,
                        stop_timezone: data.stop_timezone,
                        wheelchair_boarding: parseIntUndefinedForNaN(data.wheelchair_boarding),
                        level_id: data.level_id,
                        platform_code: data.platform_code,
                        stop_code: data.stop_code,
                        stop_desc: data.stop_desc,
                        tts_stop_name: data.tts_stop_name,
                    };

                    await pgDb
                        .insert(stopsTable)
                        .values(transformedData)
                        .onConflictDoUpdate({
                            target: [stopsTable.stop_id],
                            set: transformedData,
                        });
                }

                async function insertTrips(data: Record<string, string>) {
                    const transformedData = {
                        route_id: data.route_id,
                        service_id: data.service_id,
                        trip_id: data.trip_id,
                        trip_headsign: data.trip_headsign,
                        direction_id: parseIntUndefinedForNaN(data.direction_id),
                        block_id: data.block_id,
                        shape_id: data.shape_id,
                        wheelchair_accessible: parseIntUndefinedForNaN(data.wheelchair_accessible),
                        bikes_allowed: parseIntUndefinedForNaN(data.bikes_allowed),
                        trip_short_name: data.trip_short_name,
                    };

                    await pgDb
                        .insert(tripsTable)
                        .values(transformedData)
                        .onConflictDoUpdate({
                            target: [tripsTable.trip_id],
                            set: transformedData,
                        });
                }

                async function insertRoutes(data: Record<string, string>) {
                    const transformedData = {
                        route_id: data.route_id,
                        route_short_name: data.route_short_name,
                        route_long_name: data.route_long_name,
                        route_type: parseInt(data.route_type),
                        route_color: data.route_color,
                        route_text_color: data.route_text_color,
                        route_sort_order: parseIntUndefinedForNaN(data.route_sort_order),
                        route_url: data.route_url,
                        route_desc: data.route_desc,
                        agency_id: data.agency_id,
                        continuous_drop_off: parseIntUndefinedForNaN(data.continuous_drop_off),
                        continuous_pickup: parseIntUndefinedForNaN(data.continuous_pickup),
                        network_id: data.network_id,
                    };

                    await pgDb
                        .insert(routesTable)
                        .values(transformedData)
                        .onConflictDoUpdate({
                            target: [routesTable.route_id],
                            set: transformedData,
                        });
                }

                async function insertTripUpdates(data: Record<string, string>) {
                    // Ignore
                }

                async function insertVehiclePositions(data: Record<string, string>) {
                    // Ignore
                }

                async function insertCalendarDates(data: Record<string, string>) {
                    const transformedData = {
                        date: parseInt(data.date),
                        exception_type: parseInt(data.exception_type),
                        service_id: data.service_id,
                    };

                    await pgDb
                        .insert(calendarDatesTable)
                        .values(transformedData)
                        .onConflictDoUpdate({
                            target: [calendarDatesTable.service_id, calendarDatesTable.date],
                            set: transformedData,
                        });
                }
            },
        });
    } // for
}
