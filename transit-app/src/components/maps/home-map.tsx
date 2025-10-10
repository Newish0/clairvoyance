import { ProtoMap } from "@/components/maps/proto-map";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Marker, useMap, type ViewStateChangeEvent } from "react-map-gl/maplibre";
import { useDebounce } from "@uidotdev/usehooks";

export const HomeMap = () => {
    const [viewState, setViewState] = useState({
        longitude: -123.35,
        latitude: 48.47,
        zoom: 15,
    });

    const [nearbyStopQueryParams, setNearbyStopQueryParams] = useState({
        lat: viewState.latitude,
        lng: viewState.longitude,
        radius: 1500,
    });
    const debouncedNearbyStopQueryParams = useDebounce(nearbyStopQueryParams, 300);

    const { data } = useQuery({
        ...trpc.stop.getNearby.queryOptions(debouncedNearbyStopQueryParams),
        enabled: viewState.zoom > 13,
    });

    return (
        <ProtoMap
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            onMoveEnd={() =>
                setNearbyStopQueryParams({
                    lat: viewState.latitude,
                    lng: viewState.longitude,
                    radius: Math.min((18 - viewState.zoom) * 100, 5000), // TODO: Use bbox instead
                })
            }
        >
            {data?.map((stop) => (
                <Marker
                    key={stop._id}
                    longitude={stop.location.coordinates[0]}
                    latitude={stop.location.coordinates[1]}
                />
            ))}
        </ProtoMap>
    );
};
