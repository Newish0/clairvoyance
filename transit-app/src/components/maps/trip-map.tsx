import { ProtoMap } from "@/components/maps/proto-map";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";
import React, { useCallback, useMemo, useState } from "react";
import { Layer, Source, type ViewStateChangeEvent } from "react-map-gl/maplibre";
export type TripMapProps = {
    agencyId: string;
    atStopId: string;
    stopIds: string[];
    shapeObjectId: string;
};

export const TripMap: React.FC<TripMapProps> = (props) => {
    const [viewState, setViewState] = useState({
        longitude: -123.35,
        latitude: 48.47,
        zoom: 15,
    });

    const { data: atStops } = useQuery(
        trpc.stop.getStops.queryOptions({ agencyId: props.agencyId, stopId: props.atStopId })
    );
    const atStop = atStops?.[0]; // TODO: Do muted for stops before at stop & use routeColor

    // const [nearbyStopQueryParams, setNearbyStopQueryParams] = useState({
    //     lat: viewState.latitude,
    //     lng: viewState.longitude,
    //     bbox: {
    //         minLat: 0,
    //         maxLat: 0,
    //         minLng: 0,
    //         maxLng: 0,
    //     },
    // });
    // const throttledNearbyStopQueryParams = useThrottle(nearbyStopQueryParams, 1000);

    const handleMove = useCallback(
        (evt: ViewStateChangeEvent) => {
            const bounds = evt.target.getBounds();
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();

            // setNearbyStopQueryParams({
            //     lat: evt.viewState.latitude,
            //     lng: evt.viewState.longitude,
            //     bbox: {
            //         minLat: sw.lat - 0.001,
            //         maxLat: ne.lat + 0.001,
            //         minLng: sw.lng - 0.001,
            //         maxLng: ne.lng + 0.001,
            //     },
            // });

            setViewState(evt.viewState);
        },
        [setViewState]
        // [setNearbyStopQueryParams, setViewState]
    );

    return (
        <ProtoMap {...viewState} onMove={handleMove}>
            <ShapesGeojsonLayer shapeObjectId={props.shapeObjectId} />
            <StopsGeojsonLayer stopIds={props.stopIds} agencyId={props.agencyId} />
        </ProtoMap>
    );
};

const StopsGeojsonLayer: React.FC<{
    stopIds: string[];
    agencyId: string;
    stopBorderColor?: string;
    stopColor?: string;
}> = (props) => {
    const { data: stopsGeojson } = useQuery({
        ...trpc.stop.getGeojson.queryOptions({
            agencyId: props.agencyId,
            stopId: props.stopIds,
        }),
    });
    const colors = useThemeColors();

    const stopBorderCircleLayerStyle = useMemo(
        () =>
            ({
                type: "circle",
                paint: {
                    "circle-radius": 10,
                    "circle-color": props.stopBorderColor || colors.background,
                },
            }) as const,
        [colors.background, props.stopBorderColor]
    );

    const stopFillCircleLayerStyle = useMemo(
        () =>
            ({
                type: "circle",
                paint: {
                    "circle-radius": 6,
                    "circle-color": props.stopColor || colors.foreground,
                },
            }) as const,
        [colors.foreground, props.stopColor]
    );

    return (
        <>
            {stopsGeojson && (
                <>
                    <Source type="geojson" data={stopsGeojson as FeatureCollection}>
                        <Layer {...stopBorderCircleLayerStyle} />
                    </Source>
                    <Source type="geojson" data={stopsGeojson as FeatureCollection}>
                        <Layer {...stopFillCircleLayerStyle} />
                    </Source>
                </>
            )}
        </>
    );
};

const ShapesGeojsonLayer: React.FC<{ shapeObjectId: string; shapeColor?: string }> = (props) => {
    const { data: shapeGeojson } = useQuery({
        ...trpc.shape.getGeoJson.queryOptions({
            shapeObjectId: props.shapeObjectId,
        }),
    });

    const colors = useThemeColors();

    const shapeLayerStyle = useMemo(
        () =>
            ({
                type: "line",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: { "line-color": props.shapeColor || colors.foreground, "line-width": 10 },
            }) as const,
        [colors.foreground, props.shapeColor]
    );

    return (
        <>
            {shapeGeojson && (
                <Source type="geojson" data={shapeGeojson.geometry as unknown as FeatureCollection}>
                    <Layer {...shapeLayerStyle} />
                </Source>
            )}
        </>
    );
};
