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
import type { AppRouter } from "../../../../transit-api/server/src";
import { UserLocationControl, UserLocationMarker } from "./user-location";
import { Badge } from "../ui/badge";
import { AnimatePresence, motion } from "framer-motion";

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

    const isInBound = (coord: [number, number]) => map?.getBounds().contains(coord);

    return (
        <>
            {stops.map(
                (stop) =>
                    isInBound(stop.location.coordinates) && (
                        <StopMarker key={stop._id} stop={stop} showRoutes={showRoutes} />
                    )
            )}
        </>
    );
};

const StopMarker: React.FC<{
    stop: inferProcedureOutput<AppRouter["stop"]["getNearby"]>[number];
    showRoutes: boolean;
}> = ({ stop, showRoutes }) => {
    const { data: routesAtStop } = useQuery({
        ...trpc.stop.getNearbyRoutesByStop.queryOptions({
            agencyId: stop.agency_id,
            stopId: stop.stop_id,
        }),
        enabled: showRoutes,
    });
    return (
        <>
            <Marker
                longitude={stop.location.coordinates[0]}
                latitude={stop.location.coordinates[1]}
                anchor="bottom"
            >
                <div className="relative flex items-center gap-1">
                    <button
                        className={cn(
                            "relative flex flex-col items-center justify-center",
                            "cursor-pointer transition-transform hover:scale-110 active:scale-95",
                            "bg-primary-foreground/60 backdrop-blur-sm",
                            "border shadow-xl h-10 w-10",
                            "rounded-tl-full rounded-bl-full rounded-tr-full rotate-45"
                        )}
                    >
                        <BusIcon size={18} className="drop-shadow-md -rotate-45" />
                    </button>

                    <AnimatePresence>
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
                    </AnimatePresence>
                </div>
            </Marker>
        </>
    );
};
