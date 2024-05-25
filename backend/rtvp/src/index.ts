import pgDb from "clairvoyance-db";
import { realtime_vehicle_position as rtvpTable } from "clairvoyance-db/schemas/rtvp";
import { stop_time_updates as stopTimeUpdatesTable } from "clairvoyance-db/schemas/stop_time_updates";
import { trip_updates as tripUpdatesTable } from "clairvoyance-db/schemas/trip_updates";

import { importGtfsRt, timeToNumber } from "gtfs-parser";
import { computeVehiclePTravelled, isDuplicate } from "./utils/rtvp";
import type GtfsRealtimeBindings from "gtfs-realtime-bindings";

const REALTIME_UPDATE_INTERVAL = 15 * 1000; // 15 seconds
const PREDICTION_COEFF_UPDATE_INTERVAL = 60 * 1000; // 60 seconds

function performUpdate() {
    updateGtfsRealtime();
}

const urls = [
    "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48",
    "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48",
];

async function updateGtfsRealtime() {
    const feeds = await importGtfsRt({
        url: urls,
    });

    // Order matters for the following import due to foreign key constraints
    // 1. Import stop time updates
    // 2. Import trip updates
    // 3. Import vehicle positions

    console.log("Importing", feeds.length, "feeds");
    await updateStopTimeUpdates(feeds);
    await updateTripUpdates(feeds);
    await updateVehiclePositions(feeds);
}

async function updateStopTimeUpdates(feeds: GtfsRealtimeBindings.transit_realtime.FeedMessage[]) {
    for (const feed of feeds) {
        for (const entity of feed.entity) {
            if (!entity.tripUpdate?.stopTimeUpdate) {
                continue;
            }

            for (const stopTimeUpdate of entity.tripUpdate.stopTimeUpdate) {
                const newDbSTU: typeof stopTimeUpdatesTable.$inferInsert = {
                    trip_id: entity.tripUpdate.trip.tripId,
                    stop_sequence: stopTimeUpdate.stopSequence,
                    stop_id: stopTimeUpdate.stopId,
                    arrival_delay: stopTimeUpdate.arrival?.delay ?? null,
                    arrival_timestamp: timeToNumber(stopTimeUpdate.arrival?.time),
                    departure_delay: stopTimeUpdate.departure?.delay ?? null,
                    departure_timestamp: timeToNumber(stopTimeUpdate.departure?.time),
                    schedule_relationship: stopTimeUpdate.scheduleRelationship,
                };

                try {
                    await pgDb
                        .insert(stopTimeUpdatesTable)
                        .values(newDbSTU)
                        .onConflictDoUpdate({
                            target: [
                                stopTimeUpdatesTable.trip_id,
                                stopTimeUpdatesTable.stop_sequence,
                            ],
                            set: newDbSTU,
                        });
                } catch (error) {
                    console.warn(error);
                }
            }
        } // for
    } // for
}

async function updateTripUpdates(feeds: GtfsRealtimeBindings.transit_realtime.FeedMessage[]) {
    for (const feed of feeds) {
        for (const entity of feed.entity) {
            if (!entity.tripUpdate) {
                continue;
            }

            let tripDate = null; // Create date object from trip start time and date
            if (entity.tripUpdate.trip.startTime && entity.tripUpdate.trip.startDate) {
                const tripStartDate = entity.tripUpdate.trip.startDate.replace(
                    /(\d{4})(\d{2})(\d{2})/,
                    "$1-$2-$3"
                ); // 20210619 -> 2021-06-19
                tripDate = new Date(tripStartDate + " GMT-0700"); // FIXME: hardcoded timezone
                const [h, m, s] = entity.tripUpdate.trip.startTime.split(":");
                tripDate.setHours(parseInt(h), parseInt(m), parseInt(s), 0);
            }

            const newDbTU: typeof tripUpdatesTable.$inferInsert = {
                trip_id: entity.tripUpdate.trip.tripId,
                route_id: entity.tripUpdate.trip.routeId,
                direction_id: entity.tripUpdate.trip.directionId,
                start_date: entity.tripUpdate.trip.startDate,
                trip_start_time: entity.tripUpdate.trip.startTime,
                trip_start_timestamp: tripDate,
                schedule_relationship: entity.tripUpdate.trip.scheduleRelationship,
                timestamp: timeToNumber(feed.header.timestamp),
            };

            // Only add trip updates if they are schedule
            if (newDbTU.schedule_relationship !== 0) {
                console.log("Skipping trip update", newDbTU.trip_id);
                continue;
            }

            try {
                await pgDb
                    .insert(tripUpdatesTable)
                    .values(newDbTU)
                    .onConflictDoUpdate({
                        target: [
                            tripUpdatesTable.trip_id,
                            tripUpdatesTable.start_date,
                            tripUpdatesTable.trip_start_time,
                        ],
                        set: newDbTU,
                    });
            } catch (error) {
                console.warn(error);
            }
        } // for
    } // for
}

async function updateVehiclePositions(feeds: GtfsRealtimeBindings.transit_realtime.FeedMessage[]) {
    for (const feed of feeds) {
        for (const entity of feed.entity) {
            if (!entity.vehicle) {
                continue;
            }

            const newDbRTVP: typeof rtvpTable.$inferInsert = {
                trip_id: entity.vehicle.trip?.tripId,
                timestamp: new Date((timeToNumber(entity.vehicle.timestamp) ?? Date.now()) * 1000),
                vehicle_id: entity.vehicle.vehicle?.id,
                latitude: entity.vehicle.position?.latitude,
                longitude: entity.vehicle.position?.longitude,
                bearing: entity.vehicle.position?.bearing,
                speed: entity.vehicle.position?.speed,
                stop_id: entity.vehicle.stopId,
                p_traveled: -1,
                trip_update_id: -1,
            };

            // Do not add vehicles with no trip id or vehicle id
            if (!newDbRTVP.trip_id || !newDbRTVP.vehicle_id) continue;

            // Ignore duplicates
            if (
                await isDuplicate({
                    timestamp: newDbRTVP.timestamp,
                    trip_id: newDbRTVP.trip_id,
                    vehicle_id: newDbRTVP.vehicle_id,
                })
            ) {
                console.log(
                    "Duplicate vehicle position",
                    newDbRTVP.trip_id,
                    "at",
                    newDbRTVP.timestamp
                );
                continue;
            }

            // Compute p_traveled
            if (newDbRTVP.trip_id && newDbRTVP.latitude && newDbRTVP.longitude) {
                newDbRTVP.p_traveled = await computeVehiclePTravelled(
                    newDbRTVP.trip_id,
                    newDbRTVP.latitude,
                    newDbRTVP.longitude
                );
            }

            // Find related trip update
            const relatedTripUpdate = await pgDb.query.trip_updates.findFirst({
                columns: { trip_update_id: true },
                where: (tu, { eq }) => eq(tu.trip_id, newDbRTVP.trip_id!),
                orderBy: (tu, { desc }) => desc(tu.timestamp),
            });

            if (!relatedTripUpdate) {
                console.log("No related trip update found for", newDbRTVP.trip_id);
                continue;
            }

            newDbRTVP.trip_update_id = relatedTripUpdate.trip_update_id;

            try {
                await pgDb.insert(rtvpTable).values(newDbRTVP).onConflictDoNothing();
            } catch (error) {
                console.warn(error);
            }
        } // for
    } // for
}

setInterval(performUpdate, REALTIME_UPDATE_INTERVAL);
performUpdate();
