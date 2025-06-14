import { createGeolocationWatcher } from "@solid-primitives/geolocation";
import { makePersisted, storageSync } from "@solid-primitives/storage";
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { DEFAULT_LOCATION } from "~/constants/location";
import { calculateHaversineDistance } from "~/utils/distance";

export interface Location {
    lat: number;
    lng: number;
    timestamp?: number;
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
        storage: sessionStorage,
        name: "selectedLocation",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        sync: storageSync,
    }
);

export const selectedLocation = _selectedLocation;

/**
 * Global map location store/hook
 * @param options
 * @returns
 */
export function useMapLocation(options: UseMapLocationOptions = {}): UseMapLocationReturn {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const [geolocationError, setGeolocationError] = createSignal<string | null>(null);

    let isAttached = false;

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
        // 1. Selected location exists AND
        // 2. (No current location OR locations are NOT within threshold)
        return selected !== null && (!geolocationAvailable() || !isWithinThreshold());
    });

    // Auto-set selected location. 3 Cases to consider:
    // 1. Current location exists AND selected location does NOT exist
    //     - Use current location
    // 2. Current location does NOT exist AND selected location does NOT exist
    //     - Use default location
    // 3. Current location exists AND is attached to geolocation
    //     - Sync selected location to current
    // 4. Current location AND selected location exist AND are NOT attached to geolocation
    //    AND selected location is older than current location by maximumAge
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
                } else if (geolocation && isAttached) {
                    console.log("Case 3");
                    setSelectedLocation(geolocation);
                } else if (
                    geolocation &&
                    selected &&
                    !isAttached &&
                    geolocation.timestamp - selected.timestamp > options.maximumAge
                ) {
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
            isAttached = true;
            newLocation.lat = geoLocation.lat;
            newLocation.lng = geoLocation.lng;
        } else {
            isAttached = false;
        }

        setSelectedLocationSignal(newLocation);
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
