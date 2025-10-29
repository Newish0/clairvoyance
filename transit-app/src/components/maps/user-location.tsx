import { usePersistUserSetLocation } from "@/hooks/use-persist-user-set-location";
import { cn } from "@/lib/utils";
import { useDebounce, useGeolocation } from "@uidotdev/usehooks";
import { LngLat } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import { toast } from "sonner";

// TODO: 
// 5. New route or on index.ts (prob new route) to show nearby trips at given location from search param
// 6. index.ts and the new route can set a specific time instead of always current time for nearby trips.??? Something to consider

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

export const UserLocationMarker: React.FC<{ geolocationAttachmentThreshold?: number }> = ({
    geolocationAttachmentThreshold = 25,
}) => {
    const geolocation = useGeolocation({
        enableHighAccuracy: true,
    });

    const debouncedGeolocation = useDebounce(geolocation, 50); // Ignore transient geolocation errors
    const userLocation = useMemo(
        () =>
            debouncedGeolocation.longitude !== null && debouncedGeolocation.latitude !== null
                ? new LngLat(debouncedGeolocation.longitude, debouncedGeolocation.latitude)
                : null,
        [debouncedGeolocation]
    );

    const [userSetLocation] = usePersistUserSetLocation();

    const isUserSetLocationActive =
        !userLocation || userLocation.distanceTo(userSetLocation) > geolocationAttachmentThreshold;

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
