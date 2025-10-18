import { ProtoMap } from "@/components/maps/proto-map";
import { EMPTY_FEATURE_COLLECTION } from "@/constants/geojson";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { trpc } from "@/main";
import { getMutedColor, withOpacity } from "@/utils/css";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useState } from "react";
import { Layer, Source, type LayerProps, type ViewStateChangeEvent } from "react-map-gl/maplibre";

export type TripMapProps = {
    agencyId: string;
    atStopId: string;
    atStopDistTraveled?: number;
    routeColor?: string;
    routeTextColor?: string;
    stopIds: string[];
    shapeObjectId?: string;
};

export const TripMap: React.FC<TripMapProps> = (props) => {
    const [viewState, setViewState] = useState({
        longitude: -123.35,
        latitude: 48.47,
        zoom: 15,
    });

    const handleMove = useCallback(
        (evt: ViewStateChangeEvent) => {
            setViewState(evt.viewState);
        },
        [setViewState]
    );

    return (
        <ProtoMap {...viewState} onMove={handleMove}>
            <ShapesGeojsonLayer
                shapeObjectId={props.shapeObjectId}
                atShapeDistTraveled={props.atStopDistTraveled}
                shapeColor={props.routeColor}
            />
            <StopsGeojsonLayer
                stopIds={props.stopIds}
                atStopId={props.atStopId}
                agencyId={props.agencyId}
                stopColor={props.routeColor}
                stopBorderColor={props.routeTextColor}
            />
        </ProtoMap>
    );
};

const StopsGeojsonLayer: React.FC<{
    stopIds: string[];
    atStopId: string;
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

    const atStopIndex =
        stopsGeojson?.features.findIndex(
            (feature) => feature.properties?.stopId === props.atStopId
        ) ?? Infinity;

    const indexedStopsGeojson = stopsGeojson
        ? {
              ...stopsGeojson,
              features: stopsGeojson.features.map((feature, index) => ({
                  ...feature,
                  properties: {
                      ...feature.properties,
                      index: index,
                  },
              })),
          }
        : EMPTY_FEATURE_COLLECTION;

    const borderColor = props.stopBorderColor || colors.background;
    const stopColor = props.stopColor || colors.foreground;
    const mutedBorderColor = getMutedColor(borderColor);
    const mutedStopColor = getMutedColor(stopColor);

    const stopBorderCircleLayerStyle: LayerProps = {
        type: "circle",
        paint: {
            "circle-radius": 10,
            "circle-color": [
                "case",
                ["<", ["get", "index"], atStopIndex],
                mutedBorderColor, // before target
                borderColor, // including and after target
            ],
        },
    };

    const stopFillCircleLayerStyle: LayerProps = {
        type: "circle",
        paint: {
            "circle-radius": 6,
            "circle-color": [
                "case",
                ["<", ["get", "index"], atStopIndex],
                mutedStopColor, // before target
                stopColor, // including and after target
            ],
        },
    };

    return (
        <>
            <Source type="geojson" data={indexedStopsGeojson}>
                <Layer {...stopBorderCircleLayerStyle} />
            </Source>
            <Source type="geojson" data={indexedStopsGeojson}>
                <Layer {...stopFillCircleLayerStyle} />
            </Source>
        </>
    );
};

const ShapesGeojsonLayer: React.FC<{
    shapeObjectId?: string;
    atShapeDistTraveled?: number;
    shapeColor?: string;
}> = (props) => {
    const { data: shapeGeojson } = useQuery({
        ...trpc.shape.getGeoJson.queryOptions({
            shapeObjectId: props.shapeObjectId!,
        }),
        enabled: !!props.shapeObjectId,
    });

    const colors = useThemeColors();
    const shapeColor = props.shapeColor || colors.foreground;
    const mutedShapeColor = withOpacity(getMutedColor(shapeColor), 0.9);

    const atShapeDistTraveled = props.atShapeDistTraveled ?? 0;

    const atShapeIndex =
        shapeGeojson?.properties.distances_traveled.findIndex(
            (dist) => dist >= atShapeDistTraveled
        ) ?? 0;

    const beforeAtShapeGeojson = shapeGeojson
        ? {
              ...shapeGeojson,
              properties: {
                  ...shapeGeojson.properties,
                  distances_traveled: shapeGeojson.properties.distances_traveled.slice(
                      0,
                      atShapeIndex + 1
                  ),
              },
              geometry: {
                  ...shapeGeojson.geometry,
                  coordinates: shapeGeojson.geometry.coordinates.slice(0, atShapeIndex + 1),
              },
          }
        : EMPTY_FEATURE_COLLECTION;

    const atAndAfterShapeGeojson = shapeGeojson
        ? {
              ...shapeGeojson,
              properties: {
                  ...shapeGeojson.properties,
                  distances_traveled:
                      shapeGeojson.properties.distances_traveled.slice(atShapeIndex),
              },
              geometry: {
                  ...shapeGeojson.geometry,
                  coordinates: shapeGeojson.geometry.coordinates.slice(atShapeIndex),
              },
          }
        : EMPTY_FEATURE_COLLECTION;

    const beforeShapeLayerStyle: LayerProps = {
        type: "line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": mutedShapeColor, "line-width": 6 },
    };

    const atAndAfterShapeLayerStyle: LayerProps = {
        type: "line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": shapeColor, "line-width": 10 },
    };

    return (
        <>
            <Source type="geojson" data={beforeAtShapeGeojson}>
                <Layer {...beforeShapeLayerStyle} />
            </Source>
            <Source type="geojson" data={atAndAfterShapeGeojson}>
                <Layer {...atAndAfterShapeLayerStyle} />
            </Source>
        </>
    );
};
