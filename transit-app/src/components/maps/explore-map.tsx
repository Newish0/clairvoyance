import { ProtoMap } from "@/components/maps/proto-map";
import { DEFAULT_LOCATION } from "@/constants/location";
import { trpcOptions } from "@/main";
import { haversine } from "@/utils/geo";
import { useQuery } from "@tanstack/react-query";
import { useThrottle } from "ahooks";
import { LngLat, type MapLibreEvent } from "maplibre-gl";
import { useCallback, useState } from "react";
import { type LngLatBounds, type ViewStateChangeEvent } from "react-map-gl/maplibre";
import AppMapSideControls from "./controls/app-map-side-controls";
import { StopMarkers } from "./markers/stop-marker";
import { UserLocationControl, UserLocationMarker } from "./user-location";

export type ExploreMapProps = {
    fixedUserLocation?: LngLat;
    onLocationChange?: (lat: number, lng: number, viewBounds: LngLatBounds) => void;
    stopsInfoMinZoomLevel?: number;
};

export const ExploreMap: React.FC<ExploreMapProps> = ({
    onLocationChange,
    fixedUserLocation,
    stopsInfoMinZoomLevel = 16,
}) => {
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
    const throttledNearbyStopQueryParams = useThrottle(nearbyStopQueryParams, { wait: 2000 });

    const { data: nearbyStops } = useQuery({
        ...trpcOptions.stop.getNearby.queryOptions(throttledNearbyStopQueryParams),
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
            <AppMapSideControls />

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
