import {
    createResource,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
    type Component,
} from "solid-js";

import { Layer, Marker, Source, type Viewport } from "solid-map-gl";

import { differenceInSeconds } from "date-fns";
import { BusFrontIcon } from "lucide-solid";
import { useRouteLiveVehicles } from "~/hooks/use-route-live-vehicles";
import { cn } from "~/lib/utils";
import { getShapeAsGeoJson } from "~/services/shapes";
import { getStopsGeoJson } from "~/services/stops";
import { getScheduledTripDetails } from "~/services/trips";

import { ProgressCircle } from "~/components/ui/progress-circle";
import { Badge } from "../ui/badge";

import {
    DirectionId,
    OccupancyStatus,
    StopTimeUpdateScheduleRelationship,
    type ScheduledTripDocument,
} from "gtfs-db-types";
import { createEffect, on } from "solid-js";
import { Sheet, SheetContent } from "~/components/ui/sheet";
import { useMapLocation } from "~/hooks/use-map-location";
import BaseMap from "../ui/base-map";
import TripVehicleInfo from "../ui/trip-vehicle-info";

type TripMapProps = {
    tripObjectId: string;
    stopId: string;
};

const TripMap: Component<TripMapProps> = (props) => {
    const [selectedTripVehicle, setSelectedTripVehicle] =
        createSignal<ScheduledTripDocument | null>(null);

    const [tripDetails] = createResource(() => getScheduledTripDetails(props.tripObjectId));
    const [rawShapeLineGeoJson] = createResource(
        () => ({ shapeId: tripDetails()?.shape_id }),
        ({ shapeId }) => getShapeAsGeoJson(shapeId)
    );
    const [rawStopsGeoJson] = createResource(
        () => ({
            stopIds: tripDetails()?.stop_times.map((st) => st.stop_id),
        }),
        ({ stopIds }) => stopIds && getStopsGeoJson(stopIds)
    );

    const { vehicles: vehiclesMap, error } = useRouteLiveVehicles({
        routeId: () => tripDetails()?.route_id,
        directionId: () => tripDetails()?.direction_id as DirectionId,
    });
    const vehicles = () => vehiclesMap().values().toArray();

    /** Group stops into before and after our stop */
    const groupedStopsGeoJson = () => {
        if (!rawStopsGeoJson() || !tripDetails()) return;

        // Sort by stop sequence
        const stopTimes = tripDetails()?.stop_times;

        const sortedFeatures = rawStopsGeoJson()?.features.toSorted(
            (a, b) =>
                stopTimes.find((st) => st.stop_id === a.properties.stopId).stop_sequence -
                stopTimes.find((st) => st.stop_id === b.properties.stopId).stop_sequence
        );
        const ourStopIndex: number = sortedFeatures.findIndex(
            (f) => f.properties.stopId === props.stopId
        );

        // Split into before and after our stop
        const before = sortedFeatures.slice(0, ourStopIndex);
        const after = sortedFeatures.slice(ourStopIndex);

        return {
            before: {
                type: "FeatureCollection",
                features: before,
            },
            after: {
                type: "FeatureCollection",
                features: after,
            },
            at: {
                type: "FeatureCollection",
                features: [sortedFeatures[ourStopIndex]],
                index: ourStopIndex,
            },
        } as const;
    };

    const skippedStopsGeoJson = () => {
        if (!rawStopsGeoJson() || !tripDetails()) return;

        const stopTimes = tripDetails()?.stop_times;
        const skippedStops = stopTimes.filter(
            (st) => st.schedule_relationship === StopTimeUpdateScheduleRelationship.SKIPPED
        );

        const affectedFeatures = rawStopsGeoJson()?.features.filter((f) =>
            skippedStops.some((st) => st.stop_id === f.properties.stopId)
        );

        return {
            type: "FeatureCollection",
            features: affectedFeatures,
        };
    };

    /** Group shape line into before and after our stop */
    const groupedShapeLineGeoJson = () => {
        if (!rawShapeLineGeoJson() || !tripDetails()) return;

        const stopTimes = tripDetails()?.stop_times;

        const ourStopTime = stopTimes.find((st) => st.stop_id === props.stopId);

        const ourStopDistTraveled = ourStopTime?.shape_dist_traveled;

        // TODO: If we don't have the shape_dist_traveled, we need to calculate it.

        const coordinates = rawShapeLineGeoJson()?.geometry.coordinates;
        const distancesTraveled = rawShapeLineGeoJson()?.properties.distances_traveled;

        const nearestShapeIndex = distancesTraveled?.findIndex(
            (dist) => dist >= ourStopDistTraveled
        );

        // Split into before and after our stop
        const before = coordinates.slice(0, nearestShapeIndex + 1); // Must duplicate last point to form complete line
        const after = coordinates.slice(nearestShapeIndex);

        return {
            before: {
                type: "LineString",
                coordinates: before,
            },
            after: {
                type: "LineString",
                coordinates: after,
            },
        };
    };

    const mapLocation = useMapLocation({
        thresholdDistance: 100,
        enableHighAccuracy: true,
    });

    const [viewport, setViewport] = createSignal({
        // Format: [lon, lat]
        center: [
            mapLocation.selectedLocation()?.lng ?? 0,
            mapLocation.selectedLocation()?.lat ?? 0,
        ],
        zoom: 11,
    } as Viewport);

    const handleViewportChange = (evt: Viewport) => {
        setViewport(evt);
    };

    createEffect(
        on([mapLocation.selectedLocation], ([selectedLocation]) => {
            if (selectedLocation) {
                setViewport({
                    ...viewport(),
                    center: [selectedLocation.lng, selectedLocation.lat],
                });
            }
        })
    );

    return (
        <>
            <BaseMap viewport={viewport()} onViewportChange={handleViewportChange}>
                <Show when={groupedShapeLineGeoJson()?.before}>
                    {(geoJson) => (
                        <Source
                            source={{
                                type: "geojson",
                                data: geoJson(),
                            }}
                        >
                            <Layer
                                style={{
                                    type: "line",
                                    layout: {
                                        "line-join": "round",
                                        "line-cap": "round",
                                    },
                                    paint: {
                                        "line-color": "#999c",
                                        "line-width": 8,
                                    },
                                }}
                            />
                        </Source>
                    )}
                </Show>
                <Show when={groupedShapeLineGeoJson()?.after}>
                    {(geoJson) => (
                        <Source
                            source={{
                                type: "geojson",
                                data: geoJson(),
                            }}
                        >
                            <Layer
                                style={{
                                    type: "line",
                                    layout: {
                                        "line-join": "round",
                                        "line-cap": "round",
                                    },
                                    paint: {
                                        "line-color": "#333e",
                                        "line-width": 8,
                                    },
                                }}
                            />
                        </Source>
                    )}
                </Show>

                <Show when={skippedStopsGeoJson()}>
                    {(geoJson) => {
                        return (
                            <Source
                                source={{
                                    type: "geojson",
                                    data: geoJson(),
                                }}
                            >
                                <Layer
                                    style={{
                                        type: "circle",
                                        paint: {
                                            "circle-color": "#d339",
                                            "circle-radius": 20,
                                        },
                                    }}
                                />
                            </Source>
                        );
                    }}
                </Show>

                <Show when={groupedStopsGeoJson()?.before}>
                    {(geoJson) => (
                        <Source
                            source={{
                                type: "geojson",
                                data: geoJson(),
                            }}
                        >
                            <Layer
                                style={{
                                    type: "circle",
                                    paint: {
                                        "circle-color": "#eeee",
                                        "circle-radius": 10,
                                    },
                                }}
                            />
                            <Layer
                                style={{
                                    type: "circle",
                                    paint: {
                                        "circle-color": "#999c",
                                        "circle-radius": 6,
                                    },
                                }}
                            />
                        </Source>
                    )}
                </Show>
                <Show when={groupedStopsGeoJson()?.after}>
                    {(geoJson) => (
                        <Source
                            source={{
                                type: "geojson",
                                data: geoJson(),
                            }}
                        >
                            <Layer
                                style={{
                                    type: "circle",
                                    paint: {
                                        "circle-color": "#fffe",
                                        "circle-radius": 10,
                                    },
                                }}
                            />
                            <Layer
                                style={{
                                    type: "circle",
                                    paint: {
                                        "circle-color": "#333e",
                                        "circle-radius": 6,
                                    },
                                }}
                            />
                        </Source>
                    )}
                </Show>

                <For each={vehicles()}>
                    {(trip) => {
                        if (
                            !trip.current_position ||
                            typeof trip.current_position.longitude !== "number" ||
                            typeof trip.current_position.latitude !== "number"
                        ) {
                            return null;
                        }

                        const calSecondsAgo = () =>
                            differenceInSeconds(new Date(), trip.position_updated_at);

                        const [secondsAgo, setSecondsAgo] = createSignal(calSecondsAgo());

                        const isNotAccepting = () =>
                            trip.current_occupancy === OccupancyStatus.NOT_ACCEPTING_PASSENGERS ||
                            trip.current_occupancy === OccupancyStatus.NOT_BOARDABLE;

                        const percentageFromOccupancyStatus = () => {
                            if (
                                !trip.current_occupancy ||
                                trip.current_occupancy === OccupancyStatus.NO_DATA_AVAILABLE
                            ) {
                                return -1;
                            } else if (
                                trip.current_occupancy ===
                                    OccupancyStatus.NOT_ACCEPTING_PASSENGERS ||
                                trip.current_occupancy === OccupancyStatus.NOT_BOARDABLE
                            ) {
                                return -2;
                            } else if (trip.current_occupancy === OccupancyStatus.EMPTY) {
                                return 10;
                            } else if (
                                trip.current_occupancy === OccupancyStatus.MANY_SEATS_AVAILABLE
                            ) {
                                return 25;
                            } else if (
                                trip.current_occupancy === OccupancyStatus.FEW_SEATS_AVAILABLE
                            ) {
                                return 50;
                            } else if (
                                trip.current_occupancy === OccupancyStatus.STANDING_ROOM_ONLY
                            ) {
                                return 75;
                            } else if (
                                trip.current_occupancy ===
                                OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY
                            ) {
                                return 95;
                            } else {
                                return 100;
                            }
                        };

                        let interval: ReturnType<typeof setInterval> | null = null;

                        onMount(() => {
                            interval = setInterval(() => {
                                setSecondsAgo(calSecondsAgo());
                            }, 1000);
                        });

                        onCleanup(() => {
                            if (interval) {
                                clearInterval(interval);
                            }
                        });

                        return (
                            <Marker
                                lngLat={[
                                    trip.current_position.longitude,
                                    trip.current_position.latitude,
                                ]}
                                options={{
                                    element: (
                                        <div class="relative flex flex-col items-center justify-center">
                                            <div
                                                class={cn(
                                                    "rounded-full bg-background p-[2px]",
                                                    isNotAccepting() ? "invert" : ""
                                                )}
                                            >
                                                <ProgressCircle
                                                    value={percentageFromOccupancyStatus()}
                                                    class="w-10 h-10"
                                                >
                                                    <BusFrontIcon size={20} />
                                                </ProgressCircle>
                                            </div>

                                            <Badge
                                                variant={"default"}
                                                class="text-xs w-min p-0 px-1"
                                            >
                                                {secondsAgo()}s
                                            </Badge>
                                        </div>
                                    ),
                                }}
                                showPopup={false}
                                onOpen={() => {
                                    // Prevent opening the same trip
                                    if (trip._id === selectedTripVehicle()?._id) return;

                                    console.log("open", trip);
                                    setSelectedTripVehicle(trip);
                                }}
                                onClose={() => {
                                    // Close is handled by the sheet component
                                    console.log("close");
                                }}
                            ></Marker>
                        );
                    }}
                </For>

                {/* User GPS location marker  */}
                <Show when={mapLocation.currentLocation()}>
                    {(gpsLocation) => (
                        <Source
                            source={{
                                type: "geojson",
                                data: {
                                    type: "Point",
                                    coordinates: [gpsLocation().lng, gpsLocation().lat],
                                },
                            }}
                        >
                            <Layer
                                style={{
                                    type: "circle",
                                    paint: {
                                        "circle-color": "#e9e9ea",
                                        "circle-radius": 16,
                                    },
                                }}
                            />
                            <Layer
                                style={{
                                    type: "circle",
                                    paint: {
                                        "circle-color": "#047fbf",
                                        "circle-radius": 10,
                                    },
                                }}
                            />
                        </Source>
                    )}
                </Show>

                {/* Show selected location if there's no GPS location or selected location is different from GPS location */}
                <Show when={mapLocation.showSelectedMarker() && mapLocation.selectedLocation()}>
                    {(selectedLocation) => (
                        <Source
                            source={{
                                type: "geojson",
                                data: {
                                    type: "Point",
                                    coordinates: [selectedLocation().lng, selectedLocation().lat],
                                },
                            }}
                        >
                            <Layer
                                style={{
                                    type: "circle",
                                    paint: {
                                        "circle-color": "#e9e9ea",
                                        "circle-radius": 16,
                                    },
                                }}
                            />
                            <Layer
                                style={{
                                    type: "circle",
                                    paint: {
                                        "circle-color": "#b2047f",
                                        "circle-radius": 10,
                                    },
                                }}
                            />
                        </Source>
                    )}
                </Show>
            </BaseMap>

            {/* Vehicle marker popup  */}
            <Sheet
                open={!!selectedTripVehicle()}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedTripVehicle(null);
                    }
                }}
            >
                <Show when={selectedTripVehicle()}>
                    {(trip) => (
                        <SheetContent position="right" class="p-0">
                            <TripVehicleInfo trip={trip()} stopId={props.stopId} />
                        </SheetContent>
                    )}
                </Show>
            </Sheet>
        </>
    );
};

export default TripMap;
