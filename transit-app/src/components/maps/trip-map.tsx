import { ProtoMap } from "@/components/maps/proto-map";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import { useThrottle } from "@uidotdev/usehooks";
import { useCallback, useState } from "react";
import {
    Marker,
    useMap,
    type LngLatBounds,
    type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "../../../../transit-api/server/src";
import type { MapLibreEvent } from "maplibre-gl";
import { Map, Source, Layer } from "react-map-gl/maplibre";
import type { FeatureCollection } from "geojson";
export type TripMapProps = {
    agencyId: string;
    stopIds: string[];
    shapeObjectId: string;
};

export const TripMap: React.FC<TripMapProps> = (props) => {
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

    const { data: stopsGeojson } = useQuery({
        ...trpc.stop.getGeojson.queryOptions({
            agencyId: props.agencyId,
            stopId: props.stopIds,
        }),
    });

    const { data: shapeGeojson } = useQuery({
        ...trpc.shape.getGeoJson.queryOptions({
            shapeObjectId: props.shapeObjectId,
        }),
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

    const circleLayerStyle = {
        id: "point",
        type: "circle",
        paint: {
            "circle-radius": 10,
            "circle-color": "#007cbf",
        },
    } as const;

    const shapeLayerStyle = {
        id: "line",
        type: "line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#007cbf", "line-width": 8 },
    } as const;

    return (
        <ProtoMap {...viewState} onMove={handleMove}>
            {stopsGeojson && (
                <Source id="my-data" type="geojson" data={stopsGeojson as FeatureCollection}>
                    <Layer {...circleLayerStyle} />
                </Source>
            )}
            {shapeGeojson && (
                <Source
                    id="my-data"
                    type="geojson"
                    data={shapeGeojson.geometry as unknown as FeatureCollection}
                >
                    <Layer {...shapeLayerStyle} />
                </Source>
            )}
        </ProtoMap>
    );
};
