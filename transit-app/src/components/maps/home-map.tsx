import { ProtoMap } from "@/components/maps/proto-map";
import { cn } from "@/lib/utils";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import type { inferProcedureOutput } from "@trpc/server";
import {
    useDebounce,
    useGeolocation,
    useThrottle,
    type GeolocationState,
} from "@uidotdev/usehooks";
import { BusIcon } from "lucide-react";
import { LngLat, type MapLibreEvent } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Marker,
    useMap,
    type LngLatBounds,
    type MarkerDragEvent,
    type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import { toast } from "sonner";
import type { AppRouter } from "../../../../transit-api/server/src";
import { Badge } from "../ui/badge";
import { DEFAULT_LOCATION } from "@/constants/location";
import { usePersistUserSetLocation } from "@/hooks/use-persist-user-set-location";

export type HomeMapProps = {
    onLocationChange?: (lat: number, lng: number, viewBounds: LngLatBounds) => void;
};

export const HomeMap: React.FC<HomeMapProps> = (props) => {
    const [viewState, setViewState] = useState({
        longitude: DEFAULT_LOCATION.lng,
        latitude: DEFAULT_LOCATION.lat,
        zoom: 15,
    });

    const [nearbyStopQueryParams, setNearbyStopQueryParams] = useState({
        lat: viewState.latitude,
        lng: viewState.longitude,
        bbox: {
            minLat: 0,
            maxLat: 0,
            minLng: 0,
            maxLng: 0,
        },
    });
    const throttledNearbyStopQueryParams = useThrottle(nearbyStopQueryParams, 1000);

    const { data } = useQuery({
        ...trpc.stop.getNearby.queryOptions(throttledNearbyStopQueryParams),
        staleTime: 0,
        gcTime: 0,
        enabled: viewState.zoom > 16,
        placeholderData: (prev) => (viewState.zoom > 16 ? prev : []), // prevent flickering
    });

    const handleMove = useCallback(
        (evt: ViewStateChangeEvent) => {
            const bounds = evt.target.getBounds();
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();

            setNearbyStopQueryParams({
                lat: evt.viewState.latitude,
                lng: evt.viewState.longitude,
                bbox: {
                    minLat: sw.lat - 0.001,
                    maxLat: ne.lat + 0.001,
                    minLng: sw.lng - 0.001,
                    maxLng: ne.lng + 0.001,
                },
            });

            setViewState(evt.viewState);
            props.onLocationChange?.(evt.viewState.latitude, evt.viewState.longitude, bounds);
        },
        [setNearbyStopQueryParams, setViewState]
    );

    const handleLoad = useCallback(
        (evt: MapLibreEvent) => {
            const bounds = evt.target.getBounds();
            props.onLocationChange?.(viewState.latitude, viewState.longitude, bounds);
        },
        [viewState]
    );

    return (
        <ProtoMap
            {...viewState}
            onMove={handleMove}
            onLoad={handleLoad}
            scrollZoom={{
                around: "center",
            }}
        >
            <StopMarkers stops={data || []} />
            <UserMarker />
        </ProtoMap>
    );
};

const StopMarkers: React.FC<{
    stops: inferProcedureOutput<AppRouter["stop"]["getNearby"]>;
}> = ({ stops }) => {
    const { current: map } = useMap();

    const isInBound = (coord: [number, number]) => map?.getBounds().contains(coord);

    return (
        <>
            {stops.map(
                (stop) =>
                    isInBound(stop.location.coordinates) && (
                        <Marker
                            key={stop._id}
                            longitude={stop.location.coordinates[0]}
                            latitude={stop.location.coordinates[1]}
                        >
                            <Badge variant={"default"} className="p-0.5 w-9 h-9">
                                <BusIcon className="w-9 h-9" size={36} />
                            </Badge>
                        </Marker>
                    )
            )}
        </>
    );
};

const UserMarker: React.FC<{
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
