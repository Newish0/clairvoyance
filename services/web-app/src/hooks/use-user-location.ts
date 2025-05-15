import { useStore } from "@nanostores/solid";
import { createGeolocationWatcher } from "@solid-primitives/geolocation";
import { createEffect, on } from "solid-js";
import { $selectedUserLocation } from "~/stores/selected-location-store";

export const useUserLocation = () => {
    let isInitialLoad = true;
    const watcher = createGeolocationWatcher(true, {
        enableHighAccuracy: true,
    });

    const gpsLocation = () => watcher.location;
    const hasGpsLocation = () => !!watcher.location;

    const selectedLocation = useStore($selectedUserLocation);

    const isDifferentLocation = () => {
        return (
            gpsLocation()?.latitude !== selectedLocation().latitude ||
            gpsLocation()?.longitude !== selectedLocation().longitude
        );
    };

    const setSelectedLocation = (latitude: number, longitude: number) => {
        $selectedUserLocation.set({ latitude, longitude });
    };

    // If it's initial load, set selected location to gps location
    createEffect(
        on(
            () => watcher.location,
            () => {
                console.log("Hook watcher.location change");
                if (isInitialLoad && watcher.location) {
                    console.log("Initial load, set", watcher.location);
                    isInitialLoad = false; // MUST Call  this before setSelectedLocation
                    setSelectedLocation(watcher.location.latitude, watcher.location.longitude);
                }
            }
        )
    );

    return {
        gpsLocation,
        selectedLocation,
        hasGpsLocation,
        isDifferentLocation,
        setSelectedLocation,
    } as const;
};
