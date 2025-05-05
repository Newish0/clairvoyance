import {
    createEffect,
    createResource,
    createSignal,
    For,
    onCleanup,
    Show,
    type Component,
} from "solid-js";

import MapGL, { Layer, Marker, Source, type Viewport } from "solid-map-gl";

import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { Protocol } from "pmtiles";

import layers from "protomaps-themes-base";
import { useTheme } from "~/hooks/use-theme";
import { useVehiclePositions } from "~/hooks/use-vehicle-positions";
import { cn } from "~/lib/utils";
import { getTripGeojson } from "~/services/gtfs/geojson";
import { getTripDetails } from "~/services/gtfs/trip";
import { $userLocation } from "~/stores/user-location-store";
import { BusFrontIcon } from "lucide-solid";
import OccupancyBadge from "../ui/occupancy-badge";
import { getScheduledTripDetails } from "~/services/trips";
import { getShapeAsGeoJson } from "~/services/shapes";
import { getStopsGeoJson } from "~/services/stops";
import { calculateHaversineDistance } from "~/utils/distance";
import { useRouteLiveVehicles } from "~/hooks/use-route-live-vehicles";

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

    const { vehicles, isConnected, error } = useRouteLiveVehicles(
        () => tripDetails()?.route_id,
        () => tripDetails()?.direction_id
    );

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

    // const vehiclePos = useVehiclePositions(
    //     () => tripDetails()?.route_id,
    //     () => tripDetails()?.direction_id as 0 | 1 | undefined
    // );

    const [viewport, setViewport] = createSignal({
        // Format: [lon, lat]. Only get user location once. Do NOT rerender component on atom value change.
        // Rerendering of map on location change is handled by listeners logic below.
        center: [$userLocation.get().current.lon, $userLocation.get().current.lat],
        zoom: 11,
    } as Viewport);

    let protocol = new Protocol();
    maplibre.addProtocol("pmtiles", protocol.tile);

    onCleanup(() => {
        maplibre.removeProtocol("pmtiles");
    });

    const handleViewportChange = (evt: Viewport) => {
        setViewport(evt);
        $userLocation.setKey("current", {
            lon: evt.center[0],
            lat: evt.center[1],
        });
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
                lngLat={viewport().center}
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
                {(trip) => (
                    <Marker
                        lngLat={[trip.current_position.longitude, trip.current_position.latitude]}
                        options={{
                            element: (
                                <div class="flex flex-col items-center justify-center">
                                    <div
                                        class={cn(
                                            "w-8 h-8 bg-background flex flex-col",
                                            "justify-center items-center rounded-full text-foreground"
                                        )}
                                    >
                                        <BusFrontIcon size={20} />
                                    </div>

                                    <Show when={trip.current_occupancy}>
                                        {(occupancyStatus) => (
                                            <div class="-mt-1">
                                                <OccupancyBadge
                                                    status={occupancyStatus()}
                                                    size={8}
                                                    variant={"default"}
                                                />
                                            </div>
                                        )}
                                    </Show>
                                </div>
                            ),
                        }}
                    ></Marker>
                )}
            </For>

            {/* 
            <Show when={geoJson()}>
                {(geoJsons) => (
                    <>
                        <For each={geoJsons().stops}>
                            {(stop) => (
                                <Marker
                                    lngLat={[stop.stop_lon, stop.stop_lat]}
                                    options={{
                                        element: (
                                            <div
                                                class={cn(
                                                    "rounded-full",
                                                    stop.hasPassed ? "bg-black/20" : "bg-black/60",
                                                    stop.isYourStop
                                                        ? "w-6 h-6 border-4"
                                                        : "w-4 h-4 border-2",
                                                    "border-white/90"
                                                )}
                                            ></div>
                                        ),
                                    }}
                                ></Marker>
                            )}
                        </For>

                        <Source
                            source={{
                                type: "geojson",
                                data: geoJsons().before,
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
                        <Source
                            source={{
                                type: "geojson",
                                data: geoJsons().after,
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

                        <For each={vehiclePos()}>
                            {(vp) => (
                                <Marker
                                    lngLat={[vp.longitude, vp.latitude]}
                                    options={{
                                        element: (
                                            <div class="flex flex-col items-center justify-center">
                                                <div
                                                    class={cn(
                                                        "w-8 h-8 bg-background flex flex-col",
                                                        "justify-center items-center rounded-full text-foreground"
                                                    )}
                                                >
                                                    <BusFrontIcon size={20} />
                                                </div>

                                                <Show when={vp.occupancy_status}>
                                                    {(occupancy_status) => (
                                                        <div class="-mt-1">
                                                            <OccupancyBadge
                                                                status={occupancy_status()}
                                                                size={8}
                                                                variant={"default"}
                                                            />
                                                        </div>
                                                    )}
                                                </Show>
                                            </div>
                                        ),
                                    }}
                                ></Marker>
                            )}
                        </For>
                    </>
                )}
            </Show> */}

            {/* <Source
                source={{
                    type: "geojson",
                    data: shapesGeoJson() ?? {},
                }}
            ></Source> */}

            {/* <Source
                source={{
                    type: "geojson",
                    data: {
                        type: "Point",
                        coordinates: viewport().center,
                    },
                }}
            >
                <Layer
                    style={{
                        type: "circle",
                        paint: {
                            "circle-radius": 10,
                            "circle-color": "#007cbf",
                        },
                    }}
                />
            </Source> */}
        </MapGL>
    );
};

export default TripMap;
