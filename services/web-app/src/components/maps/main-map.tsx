import { createEffect, createSignal, on, Show, type Component } from "solid-js";

import { Marker, type Viewport } from "solid-map-gl";

import { useStore } from "@nanostores/solid";
import { createGeolocationWatcher } from "@solid-primitives/geolocation";
import { cn } from "~/lib/utils";
import { $selectedUserLocation } from "~/stores/selected-location-store";
import { calculateHaversineDistance } from "~/utils/distance";
import { isFpEqual } from "~/utils/numbers";
import BaseMap from "../ui/base-map";

const MainMap: Component = () => {
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

    const handleViewportChange = (evt: Viewport) => {
        // If the new map center is very close to the user location,
        // snap to the user location.
        let center = evt.center;
        if (geolocationWatcher.location) {
            const distFromGps = calculateHaversineDistance(
                {
                    lat: evt.center[1],
                    lon: evt.center[0],
                },
                {
                    lat: geolocationWatcher.location.latitude,
                    lon: geolocationWatcher.location.longitude,
                }
            );

            if (distFromGps < 2 / evt.zoom) {
                center = [
                    geolocationWatcher.location.longitude,
                    geolocationWatcher.location.latitude,
                ] as const;
            }
        }

        setViewport({ ...evt, center }); // Spread to ensure update
        $selectedUserLocation.set({
            latitude: center[1],
            longitude: center[0],
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
        <BaseMap viewport={viewport()} onViewportChange={handleViewportChange}>
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
        </BaseMap>
    );
};

export default MainMap;
