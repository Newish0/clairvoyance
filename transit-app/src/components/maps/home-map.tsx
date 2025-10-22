import { ProtoMap } from "@/components/maps/proto-map";
import { cn } from "@/lib/utils";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import type { inferProcedureOutput } from "@trpc/server";
import { useGeolocation, useThrottle } from "@uidotdev/usehooks";
import { BusIcon } from "lucide-react";
import { LngLat, type MapLibreEvent } from "maplibre-gl";
import { useCallback, useEffect, useState } from "react";
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

export type HomeMapProps = {
    onLocationChange?: (lat: number, lng: number, viewBounds: LngLatBounds) => void;
};

export const HomeMap: React.FC<HomeMapProps> = (props) => {
    const [viewState, setViewState] = useState({
        longitude: -123.35,
        latitude: 48.47,
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
        <ProtoMap {...viewState} onMove={handleMove} onLoad={handleLoad}>
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

const UserMarker: React.FC<{}> = ({}) => {
    const { current: map } = useMap();
    const state = useGeolocation({
        enableHighAccuracy: true,
    });
    const [userSetLocation, setUserSetLocation] = useState<LngLat>(new LngLat(-123.35, 48.47));
    const [isDraggingUserSetLocation, setIsDraggingUserSetLocation] = useState(false);

    // Handle displaying errors only once instead of map update
    useEffect(() => {
        if (state.error) {
            console.error(state.error);
            toast.error(`Error acquiring GPS location. ${state.error.message}`);
        }
    }, [state.error]);

    const userLngLat =
        state.longitude !== null && state.latitude !== null
            ? new LngLat(state.longitude, state.latitude)
            : null;

    const handleMarkerDrag = (e: MarkerDragEvent) => {
        const lngLat = e.lngLat;

        if (userLngLat && lngLat.distanceTo(userLngLat) < 25) {
            setUserSetLocation(userLngLat);
            return;
        }

        setUserSetLocation(lngLat);
        // map?.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: map.getZoom() });
    };

    const handleDragStart = () => {
        setIsDraggingUserSetLocation(true);
    };

    const handleDragEnd = () => {
        setIsDraggingUserSetLocation(false);
    };

    const userSetLocationToUserDistance =
        userSetLocation && userLngLat ? userSetLocation.distanceTo(userLngLat) : null;

    const isUserSetLocationActive =
        !userLngLat ||
        (userSetLocation
            ? userSetLocationToUserDistance && userSetLocationToUserDistance > 25
            : false);

    if (!map) {
        return null;
    }

    return (
        <>
            {userLngLat && (
                <Marker longitude={userLngLat.lng} latitude={userLngLat.lat}>
                    <div
                        className={cn(
                            "w-6 h-6 rounded-full bg-sky-400 border-4 border-white hover:scale-110"
                        )}
                    ></div>
                </Marker>
            )}

            <Marker
                longitude={userSetLocation.lng}
                latitude={userSetLocation.lat}
                onDrag={handleMarkerDrag}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                draggable
            >
                <div
                    className={cn(
                        "w-6 h-6 rounded-full bg-fuchsia-400 border-4 border-white hover:scale-110 active:scale-120 active:-translate-y-1 active:shadow-4xl transition-opacity duration-300",
                        isDraggingUserSetLocation || isUserSetLocationActive
                            ? "opacity-100"
                            : "opacity-0",
                        "hover:opacity-100"
                    )}
                ></div>
            </Marker>
        </>
    );
};
