import { createEffect, createSignal, on, Show, type Component } from "solid-js";

import { Marker, type Viewport } from "solid-map-gl";

import { useStore } from "@nanostores/solid";
import { createGeolocationWatcher } from "@solid-primitives/geolocation";
import { cn } from "~/lib/utils";
import { $selectedUserLocation } from "~/stores/selected-location-store";
import { calculateHaversineDistance } from "~/utils/distance";
import { isFpEqual } from "~/utils/numbers";
import BaseMap from "../ui/base-map";
import { useMapLocation } from "~/hooks/use-map-location";

const MainMap: Component = () => {
    const mapLocation = useMapLocation({
        thresholdDistance: 100,
        storageKey: "userSelectedLocation",
        enableHighAccuracy: true,
    });

    const [viewport, setViewport] = createSignal({
        // Format: [lon, lat]
        center: [0, 0],
        zoom: 11,
    } as Viewport);

    const handleViewportChange = (evt: Viewport) => {
        // If the new map center is very close to the user location,
        // snap to the user location.
        let center = evt.center;

        // This implicitly triggers viewport to update due to createEffect
        mapLocation.setSelectedLocation({
            lng: center[0],
            lat: center[1],
        });
    };

    // Debug logging
    createEffect(() => {
        // console.log("Map Location State:", {
        //     current: mapLocation.currentLocation(),
        //     selected: mapLocation.selectedLocation(),
        //     showSelected: mapLocation.showSelectedMarker(),
        //     // withinThreshold: mapLocation.isWithinThreshold(),
        //     geolocationAvailable: mapLocation.geolocationAvailable(),
        // });
    });

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
        <BaseMap viewport={viewport()} onViewportChange={handleViewportChange}>
            {/* User GPS location marker  */}
            <Show when={mapLocation.currentLocation()}>
                {(currentLocation) => (
                    <Marker
                        lngLat={[currentLocation().lng, currentLocation().lat]}
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
            <Show when={mapLocation.showSelectedMarker() && mapLocation.selectedLocation()}>
                {(selectedLocation) => (
                    <Marker
                        lngLat={[selectedLocation().lng, selectedLocation().lat]}
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
