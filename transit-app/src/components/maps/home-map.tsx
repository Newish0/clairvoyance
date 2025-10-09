import { ProtoMap } from "@/components/maps/proto-map";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Marker, useMap, type ViewStateChangeEvent } from "react-map-gl/maplibre";
import { debounce } from "@/lib/utils";

export const HomeMap = () => {
    const [viewState, setViewState] = useState({
        longitude: -123.35,
        latitude: 48.47,
        zoom: 14,
    });

    const { data, refetch } = useQuery({
        ...trpc.stop.getNearby.queryOptions({
            lat: viewState.latitude,
            lng: viewState.longitude,
            radius: 1500,
        }),
    });

    const debouncedRefetch = useCallback(() => debounce(refetch, 1000), [refetch]);

    return (
        <ProtoMap
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            onMoveEnd={() => debouncedRefetch()}
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
