import { createEffect, createSignal, on, onCleanup, onMount, Show, type Component } from "solid-js";
import { useMapLocation } from "~/hooks/use-map-location";
import { cn } from "~/lib/utils";
import maplibregl from "maplibre-gl";
import { useMapStyle } from "~/hooks/use-map-style";
import { isFpEqual } from "~/utils/numbers";
import { createCustomZoomController } from "~/lib/map/custom-zoom-controller";
import { LocationMarker, asHtmlElement } from "./location-marker";

const MainMap: Component = () => {
    let container: HTMLDivElement;
    const [map, setMap] = createSignal<maplibregl.Map | null>(null);

    const mapStyle = useMapStyle();
    const markers = {
        currentLocation: new maplibregl.Marker({
            element: asHtmlElement(<LocationMarker type="blue" />),
        }).setLngLat([0, 0]),
        selectedLocation: new maplibregl.Marker({
            element: asHtmlElement(<LocationMarker type="purple" />),
        }).setLngLat([0, 0]),
    } as const;

    const mapLocation = useMapLocation({
        thresholdDistance: 100,
        enableHighAccuracy: true,
    });

    onMount(() => {
        const map = new maplibregl.Map({
            container: container,
            style: mapStyle(),
            center: [0, 0], // Don't care; init in effect below
            zoom: 14,
        });

        map.once("load", () => {
            setMap(map);
        });

        map.on("move", () => {
            const center = map.getCenter();

            // Ensure selected location marker (NOT the actual selected location) is
            // always at the center of the map. (This is for the marker animation; UI only)
            markers.selectedLocation.setLngLat(center);
        });

        map.on("moveend", () => {
            const center = map.getCenter();

            // Only update the selected location when using finish selecting the location
            // to not constantly trigger map set center from side effect.
            mapLocation.setSelectedLocation({
                lng: center.lng,
                lat: center.lat,
            });
        });
    });

    onCleanup(() => {
        map()?.remove();
    });

    // Sync map center with selected location. This ensures the map is always at the selected location.
    // NOTE: if using geolocation (aka current location), the geolocation is still sync to selected location
    //       given the user has attached the selected location to the current geolocation (see `useMapLocation`)
    createEffect(
        on([mapLocation.selectedLocation, map], ([selectedLocation, map]) => {
            if (selectedLocation && map) {
                // Don't move the map if it's already at the selected location
                const mapCenter = map.getCenter();
                if (
                    isFpEqual(selectedLocation.lng, mapCenter.lng, 1e-32) &&
                    isFpEqual(selectedLocation.lat, mapCenter.lat, 1e-32)
                ) {
                    return;
                }

                map.setCenter([selectedLocation.lng, selectedLocation.lat]);
            }
        })
    );

    // Sync markers with selected location and current location
    createEffect(
        on(
            [
                map,
                mapLocation.selectedLocation,
                mapLocation.showSelectedMarker,
                mapLocation.currentLocation,
            ],
            ([map, selectedLocation, showSelectedMarker, currentLocation]) => {
                if (!map) return;

                if (currentLocation) {
                    markers.currentLocation.setLngLat([currentLocation.lng, currentLocation.lat]);
                    markers.currentLocation.addTo(map);
                }

                // Controls selected location (purple marker) visibility
                if (showSelectedMarker && selectedLocation) {
                    markers.selectedLocation.addTo(map);
                } else {
                    markers.selectedLocation.remove();
                }
            }
        )
    );

    return <div ref={container} class="w-full h-full"></div>;
};

export default MainMap;
