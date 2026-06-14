import { ProtoMap } from "@/components/maps/proto-map";
import { DEFAULT_LOCATION } from "@/constants/location";
import { cn } from "@/lib/utils";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import type { inferProcedureOutput } from "@trpc/server";
import { useThrottle } from "ahooks";
import { BusIcon } from "lucide-react";
import { LngLat, type MapLibreEvent } from "maplibre-gl";
import { useCallback, useState } from "react";
import {
    Marker,
    useMap,
    type LngLatBounds,
    type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { AppRouter } from "transit-api";
import { UserLocationControl, UserLocationMarker } from "./user-location";
import { Badge } from "../ui/badge";
import { AnimatePresence, motion } from "framer-motion";
import { haversine } from "@/utils/geo";
import Icon from "@mdi/react";
import { mdiBusStop } from "@mdi/js";
import { Link } from "@tanstack/react-router";

export type ExploreMapProps = {
    fixedUserLocation?: LngLat;
    onLocationChange?: (lat: number, lng: number, viewBounds: LngLatBounds) => void;
    stopsInfoMinZoomLevel?: number;
};

export const ExploreMap: React.FC<ExploreMapProps> = ({
    onLocationChange,
    fixedUserLocation,
    stopsInfoMinZoomLevel = 17,
}) => {
    const [viewState, setViewState] = useState({
        longitude: DEFAULT_LOCATION.lng,
        latitude: DEFAULT_LOCATION.lat,
        zoom: 16.5,
    });

    const [nearbyStopQueryParams, setNearbyStopQueryParams] = useState({
        lat: viewState.latitude,
        lng: viewState.longitude,
        radiusMeters: 100,
    });
    const throttledNearbyStopQueryParams = useThrottle(nearbyStopQueryParams, { wait: 2000 });

    const { data: nearbyStops } = useQuery({
        ...trpc.stop.getNearby.queryOptions(throttledNearbyStopQueryParams),
        staleTime: 0,
        gcTime: 0,
        enabled: viewState.zoom > stopsInfoMinZoomLevel,
        placeholderData: (prev) => (viewState.zoom > stopsInfoMinZoomLevel ? prev : []), // prevent flickering
    });

    const handleMove = useCallback(
        (evt: ViewStateChangeEvent) => {
            const bounds = evt.target.getBounds();
            const diagonalDistanceKm = haversine(bounds.getNorthEast(), bounds.getSouthWest());
            const radiusMeters = (diagonalDistanceKm * 1000) / 2;
            const clampedRadiusMeters = Math.min(radiusMeters, 3000);

            setNearbyStopQueryParams({
                lat: evt.viewState.latitude,
                lng: evt.viewState.longitude,
                radiusMeters: clampedRadiusMeters,
            });

            setViewState(evt.viewState);
            onLocationChange?.(evt.viewState.latitude, evt.viewState.longitude, bounds);
        },
        [setNearbyStopQueryParams, setViewState],
    );

    const handleLoad = useCallback(
        (evt: MapLibreEvent) => {
            const bounds = evt.target.getBounds();
            onLocationChange?.(viewState.latitude, viewState.longitude, bounds);
        },
        [viewState],
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
            {viewState.zoom > stopsInfoMinZoomLevel && <StopMarkers stops={nearbyStops || []} />}
            {fixedUserLocation ? (
                <UserLocationMarker
                    userSetLocation={fixedUserLocation}
                    centerMapToUserSetLocation
                />
            ) : (
                <UserLocationControl />
            )}
        </ProtoMap>
    );
};

const StopMarkers: React.FC<{
    stops: inferProcedureOutput<AppRouter["stop"]["getNearby"]>;
}> = ({ stops }) => {
    const { current: map } = useMap();

    const isInBound = (coord: { x: number; y: number }) =>
        map?.getBounds().contains(new LngLat(coord.x, coord.y));

    return (
        <>
            <AnimatePresence>
                {stops.map(
                    (stop) =>
                        stop.location &&
                        isInBound(stop.location) && (
                            <StopMarker
                                key={stop.id}
                                stopName={stop.name || "Unknown Stop"}
                                lng={stop.location.x}
                                lat={stop.location.y}
                                routeShortNames={stop.routes
                                    .map((route) => route.shortName)
                                    .filter((shortName) => shortName !== null)}
                            />
                        ),
                )}
            </AnimatePresence>
        </>
    );
};

const StopMarker: React.FC<{
    stopName: string;
    lng: number;
    lat: number;
    routeShortNames: string[];
}> = ({ stopName, lng, lat, routeShortNames }) => {
    return (
        <>
            <Marker longitude={lng} latitude={lat} anchor="bottom">
                <motion.div
                    className="relative flex items-center gap-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <Link
                        to="/"
                        search={{
                            lat,
                            lng,
                        }}
                        className={cn(
                            "relative flex flex-col items-center justify-center",
                            "cursor-pointer transition-transform hover:scale-110 active:scale-95",
                            "bg-primary-foreground/60 backdrop-blur-sm",
                            "border shadow-xl size-8",
                            "rounded-xl",
                        )}
                    >
                        <Icon path={mdiBusStop} size={0.8} className="drop-shadow-md opacity-75" />
                    </Link>

                    <div className="absolute left-8 m-2 w-24 line-clamp-2 leading-tight opacity-75">
                        {stopName}
                    </div>

                    <div className="absolute -bottom-6 left-9 space-x-0.5 space-y-0.5">
                        {routeShortNames?.map((shortName, i) => (
                            <Badge
                                key={i}
                                variant={"outline"}
                                className="h-5 inline  p-1 text-[10px] bg-primary-foreground/60 text-primary/60 backdrop-blur-sm"
                            >
                                {shortName}
                            </Badge>
                        ))}
                    </div>
                </motion.div>
            </Marker>
        </>
    );
};
