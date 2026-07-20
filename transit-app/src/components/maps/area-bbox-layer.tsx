import { convertCssColorToHex, resolveCssColor } from "@/utils/css";
import { useEffect, useMemo } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";

export type AreaBboxLayerProps = {
    bbox: [[number, number], [number, number]];
    fit?: boolean;
    /** Corner radius in meters */
    radius?: number;
    /** Opacity of the darkened area outside the border */
    maskOpacity?: number;
};

const METERS_PER_DEGREE_LAT = 111320;
// Mercator projection limit, used for the outer "world" ring
const WORLD_LAT_LIMIT = 85;

function metersPerDegreeLon(latitude: number) {
    return METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180);
}

/**
 * Builds a rounded-rectangle ring (array of [lon, lat] points) from a bbox.
 * Works by projecting the bbox into a local meters-based plane, drawing
 * quarter-circle arcs at each corner, then converting back to lon/lat.
 */
function createRoundedRectangle(
    bbox: [[number, number], [number, number]],
    radiusMeters: number,
    segmentsPerCorner = 12,
): [number, number][] {
    const [[west, south], [east, north]] = bbox;

    const centerLat = (south + north) / 2;
    const mPerLon = metersPerDegreeLon(centerLat);
    const mPerLat = METERS_PER_DEGREE_LAT;

    const widthM = (east - west) * mPerLon;
    const heightM = (north - south) * mPerLat;

    // clamp radius so it never exceeds half the width/height
    const r = Math.max(0, Math.min(radiusMeters, widthM / 2, heightM / 2));

    // arc centers + angle ranges, in local meters space (origin at [west, south])
    const corners = [
        { cx: r, cy: r, startAngle: 180, endAngle: 270 }, // bottom-left
        { cx: widthM - r, cy: r, startAngle: 270, endAngle: 360 }, // bottom-right
        { cx: widthM - r, cy: heightM - r, startAngle: 0, endAngle: 90 }, // top-right
        { cx: r, cy: heightM - r, startAngle: 90, endAngle: 180 }, // top-left
    ];

    const points: [number, number][] = [];

    for (const { cx, cy, startAngle, endAngle } of corners) {
        for (let i = 0; i <= segmentsPerCorner; i++) {
            const angle = startAngle + ((endAngle - startAngle) * i) / segmentsPerCorner;
            const rad = (angle * Math.PI) / 180;
            const x = cx + r * Math.cos(rad);
            const y = cy + r * Math.sin(rad);

            points.push([west + x / mPerLon, south + y / mPerLat]);
        }
    }

    points.push(points[0]); // close the ring
    return points;
}

export function AreaBboxLayer({
    bbox,
    fit = true,
    radius = 25,
    maskOpacity = 0.4,
}: AreaBboxLayerProps) {
    const { current: map } = useMap();

    useEffect(() => {
        if (!fit || !map) return;
        map.fitBounds(bbox, { padding: 40, animate: false });
    }, [fit, map, bbox]);

    const borderRing = useMemo(() => createRoundedRectangle(bbox, radius), [bbox, radius]);

    // Border feature: just the rounded-rect outline
    const borderFeature = useMemo(
        () => ({
            type: "Feature" as const,
            properties: {},
            geometry: {
                type: "Polygon" as const,
                coordinates: [borderRing],
            },
        }),
        [borderRing],
    );

    // Mask feature: a world-covering polygon with the rounded-rect as a hole
    const maskFeature = useMemo(() => {
        const worldRing: [number, number][] = [
            [-180, -WORLD_LAT_LIMIT],
            [180, -WORLD_LAT_LIMIT],
            [180, WORLD_LAT_LIMIT],
            [-180, WORLD_LAT_LIMIT],
            [-180, -WORLD_LAT_LIMIT],
        ];

        return {
            type: "Feature" as const,
            properties: {},
            geometry: {
                type: "Polygon" as const,
                coordinates: [worldRing, borderRing],
            },
        };
    }, [borderRing]);

    return (
        <>
            <Source type="geojson" data={maskFeature}>
                <Layer
                    type="fill"
                    paint={{
                        "fill-color": "#000000",
                        "fill-opacity": maskOpacity,
                    }}
                />
            </Source>

            <Source type="geojson" data={borderFeature}>
                <Layer
                    type="line"
                    layout={{
                        "line-join": "round",
                        "line-cap": "round",
                    }}
                    paint={{
                        "line-color": convertCssColorToHex("var(--primary)"),
                        "line-width": 2,
                    }}
                />
            </Source>
        </>
    );
}
