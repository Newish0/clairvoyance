import { ProtoMap } from "@/components/maps/proto-map";
import { DEFAULT_LOCATION } from "@/constants/location";
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
import { Badge } from "../ui/badge";
import { UserLocationControl, UserLocationMarker } from "./user-location";

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
            console.log("onMove", evt.viewState.latitude, evt.viewState.longitude, bounds);
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
