import {
    createResource,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
    type Component,
} from "solid-js";

import MapGL, { Layer, Marker, Source, type Viewport } from "solid-map-gl";

import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { Protocol } from "pmtiles";

import { differenceInSeconds } from "date-fns";
import { BusFrontIcon } from "lucide-solid";
import layers from "protomaps-themes-base";
import { useRouteLiveVehicles } from "~/hooks/use-route-live-vehicles";
import { useTheme } from "~/hooks/use-theme";
import { cn } from "~/lib/utils";
import { getShapeAsGeoJson } from "~/services/shapes";
import { getStopsGeoJson } from "~/services/stops";
import { getScheduledTripDetails } from "~/services/trips";
import { $userLocation } from "~/stores/user-location-store";
import { calculateHaversineDistance } from "~/utils/distance";

import { ProgressCircle } from "~/components/ui/progress-circle";
import { Badge } from "../ui/badge";

type TripMapProps = {
    tripObjectId: string;
    stopId: string;
};

const TripMap: Component<TripMapProps> = (props) => {
    const [, , isDark] = useTheme();

    const [tripDetails] = createResource(() => getScheduledTripDetails(props.tripObjectId));
    const [rawShapeLineGeoJson] = createResource(
        () => ({ shapeId: tripDetails()?.shape_id }),
        ({ shapeId }) => getShapeAsGeoJson(shapeId)
    );
    const [rawStopsGeoJson] = createResource(
        () => ({
            stopIds: tripDetails()?.scheduled_stop_times.map((st) => st.stop_id),
        }),
        ({ stopIds }) => stopIds && getStopsGeoJson(stopIds)
    );

    const { vehicles: vehiclesMap, error } = useRouteLiveVehicles({
        routeId: () => tripDetails()?.route_id,
        directionId: () => tripDetails()?.direction_id,
    });
    const vehicles = () => vehiclesMap().values().toArray();

    const ourStopIndex = () =>
        rawStopsGeoJson()?.features.findIndex((f) => f.properties.stopId === props.stopId);

    /** Group stops into before and after our stop */
    const groupedStopsGeoJson = () => {
        if (!rawStopsGeoJson()) return;

        // Sort by stop sequence
        const stopTimes = tripDetails()?.scheduled_stop_times;
        const sortedFeatures = rawStopsGeoJson()?.features.toSorted(
            (a, b) =>
                stopTimes.find((st) => st.stop_id === a.properties.stopId).stop_sequence -
                stopTimes.find((st) => st.stop_id === b.properties.stopId).stop_sequence
        );

        // Split into before and after our stop
        const before = sortedFeatures.slice(0, ourStopIndex());
        const after = sortedFeatures.slice(ourStopIndex() - 1);

        return {
            before: {
                type: "FeatureCollection",
                features: before,
            },
            after: {
                type: "FeatureCollection",
                features: after,
            },
        };
    };

    /** Group shape line into before and after our stop */
    const groupedShapeLineGeoJson = () => {
        if (!rawShapeLineGeoJson() || !rawStopsGeoJson()) return;

        const ourStopCoords = () =>
            rawStopsGeoJson()?.features[ourStopIndex()]?.geometry.coordinates;

        const nearestShapeIndex = rawShapeLineGeoJson()?.geometry.coordinates.reduce(
            (minIndex, coord, index) => {
                const dist = calculateHaversineDistance(
                    {
                        lat: coord[1],
                        lon: coord[0],
                    },
                    {
                        lat: ourStopCoords()?.[1],
                        lon: ourStopCoords()?.[0],
                    }
                );
                const minDist = calculateHaversineDistance(
                    {
                        lat: rawShapeLineGeoJson()?.geometry.coordinates[minIndex][1],
                        lon: rawShapeLineGeoJson()?.geometry.coordinates[minIndex][0],
                    },
                    {
                        lat: ourStopCoords()?.[1],
                        lon: ourStopCoords()?.[0],
                    }
                );
                return dist < minDist ? index : minIndex;
            },
            0
        );

        // Split into before and after our stop
        const before = rawShapeLineGeoJson()?.geometry.coordinates.slice(0, nearestShapeIndex + 1); // Must duplicate last point to form complete line
        const after = rawShapeLineGeoJson()?.geometry.coordinates.slice(nearestShapeIndex);

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

    const userLocationCenter = () =>
        [$userLocation.get().current.lon, $userLocation.get().current.lat] as const;

    const [viewport, setViewport] = createSignal({
        // Format: [lon, lat]. Only get user location once. Do NOT rerender component on atom value change.
        center: userLocationCenter(),
        zoom: 11,
    } as Viewport);

    let protocol = new Protocol();
    maplibre.addProtocol("pmtiles", protocol.tile);

    onCleanup(() => {
        maplibre.removeProtocol("pmtiles");
    });

    const handleViewportChange = (evt: Viewport) => {
        setViewport(evt);
    };

    return (
        <MapGL
            mapLib={maplibre}
            options={{
                style: {
                    version: 8,
                    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
                    sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
                    sources: {
                        protomaps: {
                            type: "vector",
                            url: `pmtiles://${import.meta.env.BASE_URL}map.pmtiles`,
                            attribution:
                                '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
                        },
                    },
                    layers: layers("protomaps", isDark() ? "dark" : "light", "en"),
                },
            }}
            viewport={viewport()}
            onViewportChange={handleViewportChange}
            onLoad={(evt) => {}}
        >
            <Marker
                lngLat={userLocationCenter()}
                options={{
                    element: (
                        <div
                            class={cn(
                                "rounded-full w-6 h-6 border-4",
                                "bg-sky-600/95",
                                "border-white/90"
                            )}
                        ></div>
                    ),
                }}
            ></Marker>

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
                                    "circle-radius": 12,
                                },
                            }}
                        />
                        <Layer
                            style={{
                                type: "circle",
                                paint: {
                                    "circle-color": "#999c",
                                    "circle-radius": 8,
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
                                    "circle-radius": 12,
                                },
                            }}
                        />
                        <Layer
                            style={{
                                type: "circle",
                                paint: {
                                    "circle-color": "#333e",
                                    "circle-radius": 8,
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
                        differenceInSeconds(new Date(), trip.last_realtime_update_timestamp);

                    const [secondsAgo, setSecondsAgo] = createSignal(calSecondsAgo());

                    const isNotAccepting = () => trip.current_occupancy === 0;

                    const percentageFromOccupancyStatus = () => {
                        if (!trip.current_occupancy) {
                            return -1; // No data
                        } else if (trip.current_occupancy === 0) {
                            return -2; // Not accepting
                        } else if (trip.current_occupancy === 1) {
                            return 33;
                        } else if (trip.current_occupancy === 2) {
                            return 66;
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

                                        <Badge variant={"default"} class="text-xs w-min p-0 px-1">
                                            {secondsAgo()}s
                                        </Badge>
                                    </div>
                                ),
                            }}
                        ></Marker>
                    );
                }}
            </For>
        </MapGL>
    );
};

export default TripMap;
