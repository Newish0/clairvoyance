import { createSignal, onCleanup, type Component } from "solid-js";

import MapGL, { Control, Layer, Marker, Source, type Viewport } from "solid-map-gl";

import * as maplibre from "maplibre-gl";
import { type Map as LibreGLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { Protocol } from "pmtiles";

import layers from "protomaps-themes-base";
import LocationMarker from "./location-marker";
import { cn } from "~/lib/utils";
import { DEFAULT_LOCATION } from "~/constants/location";
import { $userLocation } from "~/stores/user-location-store";
import { useTheme } from "~/hooks/use-theme";

const HomeMap: Component = () => {
    const [, , isDark] = useTheme();

    const [viewport, setViewport] = createSignal({
        // Format: [lon, lat]. Only get user location once. Do NOT rerender component on atom value change.
        // Rerendering of map on location change is handled by listeners logic below.
        center: [$userLocation.get().current.lon, $userLocation.get().current.lat],
        zoom: 11,
    } as Viewport);

    let map: LibreGLMap | null = null;

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
            onLoad={(evt) => {
                console.log(evt);
                map = evt.target;
            }}
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
        </MapGL>
    );
};

export default HomeMap;
