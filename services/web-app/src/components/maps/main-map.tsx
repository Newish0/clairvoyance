import { createEffect, createSignal, on, onCleanup, Show, type Component } from "solid-js";

import MapGL, { Marker, type Viewport } from "solid-map-gl";

import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { Protocol } from "pmtiles";

import { useStore } from "@nanostores/solid";
import { createGeolocationWatcher } from "@solid-primitives/geolocation";
import layers from "protomaps-themes-base";
import { useTheme } from "~/hooks/use-theme";
import { cn } from "~/lib/utils";
import { $selectedUserLocation } from "~/stores/selected-location-store";
import { isFpEqual } from "~/utils/numbers";

const MainMap: Component = () => {
    const [, , isDark] = useTheme();

    const geolocationWatcher = createGeolocationWatcher(true, {
        enableHighAccuracy: true,
    });

    const selectedLocation = useStore($selectedUserLocation);

    const mapCenter = () => [selectedLocation().longitude, selectedLocation().latitude] as const;

    const [viewport, setViewport] = createSignal({
        // Format: [lon, lat]. Only get user location once. Do NOT rerender component on atom value change.
        // Rerendering of map on location change is handled by listeners logic below.
        center: mapCenter(),
        zoom: 11,
    } as Viewport);

    let protocol = new Protocol();
    maplibre.addProtocol("pmtiles", protocol.tile);

    onCleanup(() => {
        maplibre.removeProtocol("pmtiles");
    });

    const handleViewportChange = (evt: Viewport) => {
        setViewport(evt);
        $selectedUserLocation.set({
            latitude: evt.center[1],
            longitude: evt.center[0],
        });
    };

    createEffect(
        on(
            () => geolocationWatcher.location,
            (loc) => {
                if (loc) {
                    setViewport((prev) => ({ ...prev, center: [loc.longitude, loc.latitude] }));
                    $selectedUserLocation.set({
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                    });
                }
            },
            {
                defer: true,
            }
        )
    );

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
            {/* User GPS location marker  */}
            <Show when={geolocationWatcher.location}>
                {(gpsLocation) => (
                    <Marker
                        lngLat={[gpsLocation().longitude, gpsLocation().latitude]}
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
                )}
            </Show>

            {/* Show selected location if there's no GPS location or selected location is different from GPS location */}
            <Show
                when={
                    !geolocationWatcher.location ||
                    !isFpEqual(geolocationWatcher.location.latitude, selectedLocation().latitude) ||
                    !isFpEqual(geolocationWatcher.location.longitude, selectedLocation().longitude)
                        ? selectedLocation()
                        : null
                }
            >
                {(selectedLocation) => (
                    <Marker
                        lngLat={[selectedLocation().longitude, selectedLocation().latitude]}
                        options={{
                            element: (
                                <div
                                    class={cn(
                                        "rounded-full w-6 h-6 border-4",
                                        "bg-purple-600/95",
                                        "border-white/90"
                                    )}
                                ></div>
                            ),
                        }}
                    ></Marker>
                )}
            </Show>
        </MapGL>
    );
};

export default MainMap;
