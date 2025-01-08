import { createResource, createSignal, For, onCleanup, Show, type Component } from "solid-js";

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

type TripMapProps = {
    tripId: string;
    stopId: string;
};

const TripMap: Component<TripMapProps> = (props) => {
    const [, , isDark] = useTheme();

    const [geoJsons] = createResource(
        () => ({ tripId: props.tripId, stopId: props.stopId }),
        ({ tripId, stopId }) => getTripGeojson(tripId, stopId)
    );

    const [tripDetails] = createResource(
        () => props.tripId,
        (tripId) => getTripDetails(tripId)
    );

    const vehiclePos = useVehiclePositions(
        () => tripDetails()?.route_id,
        () => tripDetails()?.direction_id as 0 | 1 | undefined
    );

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
                            url: "pmtiles:///map.pmtiles",
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

            <Show when={geoJsons()}>
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
                                            <div
                                                class={cn(
                                                    "rounded-full",
                                                    "bg-red-500",
                                                    "w-6 h-6 border-4",
                                                    "border-white/90"
                                                )}
                                            ></div>
                                        ),
                                    }}
                                ></Marker>
                            )}
                        </For>
                    </>
                )}
            </Show>

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
