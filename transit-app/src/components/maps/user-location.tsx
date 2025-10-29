import { usePersistUserSetLocation } from "@/hooks/use-persist-user-set-location";
import { cn } from "@/lib/utils";
import { useDebounce, useGeolocation } from "@uidotdev/usehooks";
import { LngLat } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import { toast } from "sonner";

/**
 * UserLocationControl
 *
 * React component that coordinates the map center with the device geolocation and a persisted
 * "user set" location. It renders markers for the current geolocation and the persisted user
 * location and keeps those locations synchronized according to user interactions and a proximity
 * threshold.
 *
 * Behavior summary:
 * - On mount, the map center is initialized to the persisted user set location.
 * - When a valid geolocation becomes available for the first time, geolocation wins: the map
 *   center and the persisted user set location are both set to the geolocation (this happens
 *   only once).
 * - If the control is in "attached" mode (i.e., the user set location is not actively pinned),
 *   subsequent geolocation updates update both the persisted user set location and the map center.
 * - When the user moves the map, the component compares the map center to the current geolocation:
 *   if the center is within geolocationAttachmentThreshold the control becomes attached (map
 *   follows geolocation). If the center is outside the threshold, the persisted user set location
 *   is updated to the map center and the control becomes "user-set" (detached from geolocation).
 * - Geolocation acquisition errors are logged once and surfaced as a toast notification.
 *
 * Important implementation details:
 * - The component depends on the following hooks/utilities being available in the environment:
 *   useMap (provides the map instance), useGeolocation (provides { latitude, longitude, error }),
 *   usePersistUserSetLocation (persistent [location, setLocation] pair), and useDebounce.
 * - The map instance is expected to provide setCenter, getCenter, on/off, and LngLat objects are
 *   used to represent coordinates.
 * - A ref (hasSyncedUserGeolocation) guards the "first geolocation sync" to ensure it only happens once.
 * - The component returns null until a map instance is available.
 *
 * Props:
 * @param geolocationAttachmentThreshold - Distance threshold used to decide whether the map
 *   center should be considered "near" the user's current geolocation and therefore attached to it.
 *   If the distance between map center and geolocation is less than this threshold, the control will
 *   attach to geolocation (map follows geolocation). If greater, the user's manual map movements
 *   become the persisted user set location and the control detaches. Default: 25.
 *
 * @returns A React fragment containing:
 *  - A marker for the current geolocation (rendered when geolocation is available).
 *  - A marker for the persisted user-set location (visibility indicates whether the control is active).
 *
 * @remarks
 * - The component intentionally debounces geolocation updates to ignore transient errors.
 * - Side effects include updating the map center and writing to persisted user state.
 *
 * @example
 * <UserLocationControl geolocationAttachmentThreshold={25} />
 */
export const UserLocationControl: React.FC<{
    geolocationAttachmentThreshold?: number;
}> = ({ geolocationAttachmentThreshold = 25 }) => {
    // --- States ---
    const { current: map } = useMap();
    const geolocation = useGeolocation({
        enableHighAccuracy: true,
    });
    const [userSetLocation, setUserSetLocation] = usePersistUserSetLocation();
    const [isUserSetLocationActive, setIsUserSetLocationActive] = useState(false);
    const hasSyncedUserGeolocation = useRef(false); // Ensure sync map center & userSetLocation to geolocation is done only once

    // --- Derived values ---
    const debouncedGeolocation = useDebounce(geolocation, 50); // Ignore transient geolocation errors
    const userLocation = useMemo(
        () =>
            debouncedGeolocation.longitude !== null && debouncedGeolocation.latitude !== null
                ? new LngLat(debouncedGeolocation.longitude, debouncedGeolocation.latitude)
                : null,
        [debouncedGeolocation]
    );

    // NAME: EffectOne
    // On initialization, sync map center to userSetLocation
    useEffect(() => {
        if (!map) return;

        map.setCenter(userSetLocation);
    }, [map]);

    // NAME: EffectTwo
    // On initialization of geolocation, sync map center & userSetLocation to geolocation.
    // That is, geolocation ALWAYS takes precedence over userSetLocation if available.
    useEffect(() => {
        if (!map || !userLocation || hasSyncedUserGeolocation.current) return;

        hasSyncedUserGeolocation.current = true; // Ensures this effect is run only once
        map.setCenter(userLocation);
        setUserSetLocation(userLocation);
    }, [map, userLocation, setUserSetLocation, hasSyncedUserGeolocation.current]);

    // NAME: EffectThree
    // Always sync the following to user geolocation
    //  1. userSetLocation
    //  2. map center
    // when we are NOT using user set location (AKA only when user set location is attached to geolocation).
    useEffect(() => {
        if (isUserSetLocationActive || !userLocation) return;

        setUserSetLocation(userLocation);
        setIsUserSetLocationActive(false);
        map?.setCenter(userLocation);
    }, [
        userLocation,
        setUserSetLocation,
        setIsUserSetLocationActive,
        isUserSetLocationActive,
        map,
    ]);

    // NAME: EffectFour
    // Sync userSetLocation to map center when map center is not near user's geolocation by threshold.
    // If distance from map center to user geolocation is within threshold, then allow map center and
    // user set location to be attached to geolocation (enable EffectThree by setting isUserSetLocationActive).
    useEffect(() => {
        const handleMove = () => {
            if (!map) return;
            const mapCenter = map.getCenter();

            if (
                userLocation &&
                mapCenter.distanceTo(userLocation) < geolocationAttachmentThreshold
            ) {
                if (isUserSetLocationActive) setIsUserSetLocationActive(false);
            } else {
                setUserSetLocation(new LngLat(mapCenter.lng, mapCenter.lat));
                if (!isUserSetLocationActive) setIsUserSetLocationActive(true);
            }
        };

        map?.on("move", handleMove);

        return () => {
            map?.off("move", handleMove);
        };
    }, [map, setUserSetLocation, userLocation]);

    // NAME: EffectFive
    // Handle displaying errors only once instead of map update
    useEffect(() => {
        if (debouncedGeolocation.error) {
            console.error(debouncedGeolocation.error);
            toast.error(`Error acquiring GPS location. ${debouncedGeolocation.error.message}`);
        }
    }, [debouncedGeolocation.error]);

    if (!map) {
        return null;
    }

    return (
        <>
            {userLocation && (
                <Marker longitude={userLocation.lng} latitude={userLocation.lat}>
                    <div
                        className={cn(
                            "w-6 h-6 rounded-full bg-sky-400 border-4 border-white hover:scale-110"
                        )}
                    ></div>
                </Marker>
            )}

            <Marker longitude={userSetLocation.lng} latitude={userSetLocation.lat}>
                <div
                    className={cn(
                        "w-6 h-6 rounded-full bg-fuchsia-400 border-4 border-white hover:scale-110 active:scale-120 active:-translate-y-1 active:shadow-4xl transition-opacity duration-300",
                        isUserSetLocationActive ? "opacity-100" : "opacity-0",
                        "hover:opacity-100"
                    )}
                ></div>
            </Marker>
        </>
    );
};

/**
 * UserLocationMarker
 *
 * Displays two map markers related to the current user:
 * - a live geolocation marker (when the browser/device provides coordinates)
 * - a persistent / user-set location marker (either provided via props or loaded from persisted state)
 *
 * @remarks
 * No side effects beyond reading hooks (does not modify any state) **unless** `centerMapToUserSetLocation` is true.
 */
export const UserLocationMarker: React.FC<{
    geolocationAttachmentThreshold?: number;
    userSetLocation?: LngLat;
    centerMapToUserSetLocation?: boolean;
}> = ({
    geolocationAttachmentThreshold = 25,
    userSetLocation: externalUserSetLocation,
    centerMapToUserSetLocation,
}) => {
    const { current: map } = useMap();
    const geolocation = useGeolocation({
        enableHighAccuracy: true,
    });
    const [persistedUserSetLocation] = usePersistUserSetLocation();

    const debouncedGeolocation = useDebounce(geolocation, 50); // Ignore transient geolocation errors
    const userLocation = useMemo(
        () =>
            debouncedGeolocation.longitude !== null && debouncedGeolocation.latitude !== null
                ? new LngLat(debouncedGeolocation.longitude, debouncedGeolocation.latitude)
                : null,
        [debouncedGeolocation]
    );

    const userSetLocation = externalUserSetLocation || persistedUserSetLocation;
    const isUserSetLocationActive =
        !userLocation || userLocation.distanceTo(userSetLocation) > geolocationAttachmentThreshold;

    useEffect(() => {
        if (map && centerMapToUserSetLocation) {
            map.setCenter(userSetLocation);
        }
    }, [map, userSetLocation, centerMapToUserSetLocation]);

    return (
        <>
            {userLocation && (
                <Marker longitude={userLocation.lng} latitude={userLocation.lat}>
                    <div
                        className={cn(
                            "w-6 h-6 rounded-full bg-sky-400 border-4 border-white hover:scale-110"
                        )}
                    ></div>
                </Marker>
            )}

            <Marker longitude={userSetLocation.lng} latitude={userSetLocation.lat}>
                <div
                    className={cn(
                        "w-6 h-6 rounded-full bg-fuchsia-400 border-4 border-white hover:scale-110 active:scale-120 active:-translate-y-1 active:shadow-4xl transition-opacity duration-300",
                        isUserSetLocationActive ? "opacity-100" : "opacity-0",
                        "hover:opacity-100"
                    )}
                ></div>
            </Marker>
        </>
    );
};
