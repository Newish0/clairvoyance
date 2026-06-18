import { EMPTY_FEATURE_COLLECTION } from "@/constants/geojson";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { trpcOptions } from "@/main";
import { getMutedColor, withOpacity } from "@/utils/css";
import { useQuery } from "@tanstack/react-query";
import { Layer, Source, type LayerProps } from "react-map-gl/maplibre";

export type ShapeLayerProps = {
    shapeId: number;
    targetStopShapeDistTraveled: number;
    shapeColor?: string;
};

export const ShapeLayer: React.FC<ShapeLayerProps> = (props) => {
    const { data: shapeGeojson } = useQuery({
        ...trpcOptions.shape.getGeoJsonById.queryOptions(props.shapeId),
        initialData: null,
    });

    const colors = useThemeColors();
    const shapeColor = props.shapeColor || colors.foreground;
    const mutedShapeColor = withOpacity(getMutedColor(shapeColor), 0.9);

    const targetShapeIndex =
        shapeGeojson?.properties.distancesTraveled?.findIndex(
            (dist) => dist >= props.targetStopShapeDistTraveled,
        ) ?? 0;

    const beforeAtShapeGeojson = shapeGeojson
        ? {
              ...shapeGeojson,
              properties: {
                  ...shapeGeojson.properties,
                  distancesTraveled: shapeGeojson.properties.distancesTraveled?.slice(
                      0,
                      targetShapeIndex + 1,
                  ),
              },
              geometry: {
                  ...shapeGeojson.geometry,
                  coordinates: shapeGeojson.geometry.coordinates.slice(0, targetShapeIndex + 1),
              },
          }
        : EMPTY_FEATURE_COLLECTION;

    const atAndAfterShapeGeojson = shapeGeojson
        ? {
              ...shapeGeojson,
              properties: {
                  ...shapeGeojson.properties,
                  distancesTraveled:
                      shapeGeojson.properties.distancesTraveled?.slice(targetShapeIndex),
              },
              geometry: {
                  ...shapeGeojson.geometry,
                  coordinates: shapeGeojson.geometry.coordinates.slice(targetShapeIndex),
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
