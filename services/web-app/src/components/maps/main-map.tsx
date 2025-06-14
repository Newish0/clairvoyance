import { createEffect, createSignal, on, Show, type Component } from "solid-js";
import { Marker, type Viewport } from "solid-map-gl";
import { useMapLocation } from "~/hooks/use-map-location";
import { cn } from "~/lib/utils";
import BaseMap from "../ui/base-map";

const MainMap: Component = () => {
    const mapLocation = useMapLocation({
        thresholdDistance: 100,
        enableHighAccuracy: true,
    });

    const [viewport, setViewport] = createSignal({
        // Format: [lon, lat]
        center: [0, 0],
        zoom: 11,
    } as Viewport);

    const handleViewportChange = (evt: Viewport) => {
        let center = evt.center;

        // This implicitly triggers viewport to update due to createEffect
        mapLocation.setSelectedLocation({
            lng: center[0],
            lat: center[1],
        });
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
