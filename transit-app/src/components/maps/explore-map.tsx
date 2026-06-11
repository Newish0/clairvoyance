import { ProtoMap } from "@/components/maps/proto-map";
import { DEFAULT_LOCATION } from "@/constants/location";
import { cn } from "@/lib/utils";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import type { inferProcedureOutput } from "@trpc/server";
import { useThrottle } from "@uidotdev/usehooks";
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

export type ExploreMapProps = {
    fixedUserLocation?: LngLat;
    onLocationChange?: (lat: number, lng: number, viewBounds: LngLatBounds) => void;
};

export const ExploreMap: React.FC<ExploreMapProps> = (props) => {
    const [viewState, setViewState] = useState({
        longitude: DEFAULT_LOCATION.lng,
        latitude: DEFAULT_LOCATION.lat,
        zoom: 15,
    });

    const [nearbyStopQueryParams, setNearbyStopQueryParams] = useState({
        lat: viewState.latitude,
        lng: viewState.longitude,
        radiusMeters: 100,
    });
    const throttledNearbyStopQueryParams = useThrottle(nearbyStopQueryParams, 2000);

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
            const diagonalDistanceKm = haversine(bounds.getNorthEast(), bounds.getSouthWest());
            const radiusMeters = (diagonalDistanceKm * 1000) / 2;
            const clampedRadiusMeters = Math.min(radiusMeters, 3000);

            setNearbyStopQueryParams({
                lat: evt.viewState.latitude,
                lng: evt.viewState.longitude,
                radiusMeters: clampedRadiusMeters,
            });

            setViewState(evt.viewState);
            props.onLocationChange?.(evt.viewState.latitude, evt.viewState.longitude, bounds);
        },
        [setNearbyStopQueryParams, setViewState],
    );

    const handleLoad = useCallback(
        (evt: MapLibreEvent) => {
            const bounds = evt.target.getBounds();
            props.onLocationChange?.(viewState.latitude, viewState.longitude, bounds);
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
            <StopMarkers stops={data || []} showRoutes={viewState.zoom > 18} />
            {props.fixedUserLocation ? (
                <UserLocationMarker
                    userSetLocation={props.fixedUserLocation}
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
    showRoutes: boolean;
}> = ({ stops, showRoutes }) => {
    const { current: map } = useMap();

    const isInBound = (coord: { x: number; y: number }) =>
        map?.getBounds().contains(new LngLat(coord.x, coord.y));

    return (
        <>
            {stops.map(
                (stop) =>
                    stop.location &&
                    isInBound(stop.location) && (
                        <StopMarker
                            key={stop.id}
                            stopId={stop.id}
                            lng={stop.location.x}
                            lat={stop.location.y}
                            showRoutes={showRoutes}
                        />
                    ),
            )}
        </>
    );
};

const StopMarker: React.FC<{
    stopId: number;
    lng: number;
    lat: number;
    showRoutes: boolean;
}> = ({ stopId, lng, lat, showRoutes }) => {
    // const { data: routesAtStop } = useQuery({
    //     ...trpc.stop.getNearbyRoutesByStop.queryOptions({
    //         agencyId: stop.agency_id,
    //         stopId: stop.stop_id,
    //     }),
    //     enabled: showRoutes,
    // });
    return (
        <>
            <Marker longitude={lng} latitude={lat} anchor="bottom">
                <div className="relative flex items-center gap-1">
                    <button
                        className={cn(
                            "relative flex flex-col items-center justify-center",
                            "cursor-pointer transition-transform hover:scale-110 active:scale-95",
                            "bg-primary-foreground/60 backdrop-blur-sm",
                            "border shadow-xl h-10 w-10",
                            "rounded-tl-full rounded-bl-full rounded-tr-full rotate-45",
                        )}
                    >
                        <BusIcon size={18} className="drop-shadow-md -rotate-45" />
                    </button>

                    {/* <AnimatePresence>
                        {showRoutes && (
                            <motion.div
                                className="absolute -right-36 w-36 space-x-0.5 space-y-0.5"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                {routesAtStop?.map((route) => (
                                    <Badge
                                        key={route.route_id}
                                        variant={"outline"}
                                        className="bg-primary-foreground/60 backdrop-blur-sm"
                                    >
                                        {route.route_short_name}
                                    </Badge>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence> */}
                </div>
            </Marker>
        </>
    );
};
