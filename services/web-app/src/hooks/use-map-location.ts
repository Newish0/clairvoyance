import { createGeolocationWatcher } from "@solid-primitives/geolocation";
import { throttle } from "@solid-primitives/scheduled";
import { makePersisted, storageSync } from "@solid-primitives/storage";
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { DEFAULT_LOCATION } from "~/constants/location";
import { calculateHaversineDistance } from "~/utils/distance";
import { isFpEqual } from "~/utils/numbers";

export interface Location {
    lat: number;
    lng: number;
    timestamp?: number;
    isAttached?: boolean;
}

export interface UseMapLocationOptions {
    thresholdDistance?: number; // meters, default 5
    enableHighAccuracy?: boolean; // default true
    timeout?: number; // geolocation timeout in ms
    maximumAge?: number; // geolocation cache age in ms
}

export interface UseMapLocationReturn {
    // Reactive getters (signals)
    currentLocation: () => Location | null;
    selectedLocation: () => Location | null;
    geolocationAvailable: () => boolean;
    geolocationError: () => string | null;
    showSelectedMarker: () => boolean;

    // Actions
    setSelectedLocation: (location: Location) => void;
    clearSelectedLocation: () => void;
    refreshCurrentLocation: () => void;
}

const DEFAULT_OPTIONS: Required<UseMapLocationOptions> = {
    thresholdDistance: 5,
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000,
};

// Global store
const [_selectedLocation, setSelectedLocationSignal] = makePersisted(
    createSignal<Location | null>(null),
    {
        storage: localStorage,
        name: "selectedLocation",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        sync: storageSync,
    }
);

// isAttached is intentionally NON-REACTIVE because it's a side effect derived from
// _selectedLocation and currentLocation that is used as a "helper" almost
const isAttached = () => localStorage.getItem("isSelectedLocationAttached") === "true";
const setIsAttached = (value: boolean) =>
    localStorage.setItem("isSelectedLocationAttached", String(value));

// isSessionSelectedLocation ensures we keep the selected location across different
// pages in the same session
const isSessionSelectedLocation = () =>
    sessionStorage.getItem("isSessionSelectedLocation") !== null;
const setIsSessionSelectedLocation = () =>
    sessionStorage.setItem("isSessionSelectedLocation", String(true));

export const selectedLocation = _selectedLocation;

/**
 * Global map location store/hook
 * @param options
 * @returns
 */
export function useMapLocation(options: UseMapLocationOptions = {}): UseMapLocationReturn {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const [geolocationError, setGeolocationError] = createSignal<string | null>(null);

    // Set up geolocation watcher
    const geolocationWatcher = createGeolocationWatcher(true, {
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
        maximumAge: opts.maximumAge,
    });

    // Process current location from geolocation
    const currentLocation = createMemo<Location | null>(() => {
        if (geolocationWatcher.error) {
            setGeolocationError(geolocationWatcher.error.message);
            return null;
        }

        if (geolocationWatcher.location) {
            setGeolocationError(null);
            return {
                lat: geolocationWatcher.location.latitude,
                lng: geolocationWatcher.location.longitude,
                timestamp: Date.now(),
            };
        }

        return null;
    });

    // Check if geolocation is available
    const geolocationAvailable = createMemo(() => {
        return currentLocation() !== null && !geolocationWatcher.error;
    });

    // Calculate distance between current and selected locations
    const distanceBetweenLocations = (geoLocation: Location | null, selected: Location | null) => {
        if (!geoLocation || !selected) return Infinity;

        return getDistanceBetweenLocations(geoLocation, selected);
    };

    // Check if locations are within threshold
    const isWithinThreshold = (geoLocation = currentLocation(), selected = _selectedLocation()) => {
        return distanceBetweenLocations(geoLocation, selected) <= opts.thresholdDistance;
    };

    const showSelectedMarker = createMemo(() => {
        const selected = _selectedLocation();

        // Show selected marker if:
        // 1. Is not attached to geolocation AND
        // 2. Selected location exists AND
        // 3. (No current location OR locations are NOT within threshold)
        return (
            !isAttached() && selected !== null && (!geolocationAvailable() || !isWithinThreshold())
        );
    });

    // Auto-set selected location. 3 Cases to consider:
    // 1. Current location exists AND selected location does NOT exist
    //     - Use current location
    // 2. Current location does NOT exist AND selected location does NOT exist
    //     - Use default location
    // 3. Current location exists AND is attached to geolocation
    //     - Sync selected location to current
    // 4. For when user comes back to app after an extended period of time...
    //    Selected location is NOT from the current session &&
    //    Current location AND selected location exist AND are NOT attached to geolocation
    //     - Sync selected location to current
    createEffect(
        on(
            () => geolocationWatcher.location,
            () => {
                const geolocation = currentLocation();
                const selected = _selectedLocation();

                if (geolocation && !selected) {
                    console.log("Case 1");
                    setSelectedLocation(geolocation);
                } else if (!geolocation && !selected) {
                    console.log("Case 2");
                    setSelectedLocation({
                        lat: DEFAULT_LOCATION.latitude,
                        lng: DEFAULT_LOCATION.longitude,
                    });
                } else if (geolocation && isAttached()) {
                    console.log("Case 3");
                    if (
                        isFpEqual(geolocation.lat, selected.lat, 1e-16) &&
                        isFpEqual(geolocation.lng, selected.lng, 1e-16)
                    )
                        return;
                    setSelectedLocation({
                        ...geolocation,
                    });
                } else if (
                    !isSessionSelectedLocation() &&
                    geolocation &&
                    selected &&
                    !isAttached()
                ) {
                    console.log("Case 4");
                    // TODO: might use the clearing selected if has geolocation on app load method instead...
                    setSelectedLocation(geolocation);
                }
            }
        )
    );

    // Handle selected location with side effects before save
    const setSelectedLocation = (location: Location) => {
        const newLocation = { ...location, timestamp: Date.now() };

        const geoLocation = currentLocation();
        if (geoLocation && isWithinThreshold(geoLocation, newLocation)) {
            setIsAttached(true);
            newLocation.lat = geoLocation.lat;
            newLocation.lng = geoLocation.lng;
        } else {
            setIsAttached(false);
        }

        setSelectedLocationSignal({ ...newLocation, isAttached: isAttached() });
        setIsSessionSelectedLocation();
    };

    const clearSelectedLocation = () => {
        setSelectedLocationSignal(null);
    };

    const refreshCurrentLocation = () => {
        // The geolocation watcher handles refreshing automatically
        // This function exists for API completeness and potential future use
        if (geolocationWatcher.error) {
            setGeolocationError(null);
        }
    };

    const getDistanceBetweenLocations = (loc1: Location, loc2: Location): number => {
        return calculateHaversineDistance(
            {
                lat: loc1.lat,
                lon: loc1.lng,
            },
            {
                lat: loc2.lat,
                lon: loc2.lng,
            },
            "m"
        );
    };

    // Cleanup
    onCleanup(() => {
        // The geolocation watcher automatically cleans up
    });

    return {
        // Reactive getters (return the signal functions themselves)
        currentLocation,
        selectedLocation: _selectedLocation,
        geolocationAvailable,
        geolocationError,
        showSelectedMarker,

        // Actions
        setSelectedLocation,
        clearSelectedLocation,
        refreshCurrentLocation,
    };
}
