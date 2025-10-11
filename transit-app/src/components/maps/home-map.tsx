import { ProtoMap } from "@/components/maps/proto-map";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import { useThrottle } from "@uidotdev/usehooks";
import { useCallback, useState } from "react";
import { Marker, useMap, type ViewStateChangeEvent } from "react-map-gl/maplibre";
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "../../../../transit-api/server/src";

export const HomeMap = () => {
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
    const debouncedNearbyStopQueryParams = useThrottle(nearbyStopQueryParams, 1000);

    const { data } = useQuery({
        ...trpc.stop.getNearby.queryOptions(debouncedNearbyStopQueryParams),
        enabled: viewState.zoom > 16,
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
        },
        [setNearbyStopQueryParams, setViewState]
    );

    return (
        <ProtoMap {...viewState} onMove={handleMove}>
            <StopMarkers stops={data || []} />
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
                        />
                    )
            )}
        </>
    );
};
