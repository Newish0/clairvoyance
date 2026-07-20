import { convertCssColorToHex } from "@/utils/css";
import { useEffect, useMemo, useState } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import type maplibregl from "maplibre-gl";

export type AreaBboxLayerProps = {
    bbox: [[number, number], [number, number]];
    fit?: boolean;
    /** Corner radius in CSS pixels - same idea as border-radius */
    radius?: number;
    /** Opacity of the darkened area outside the border */
    maskOpacity?: number;
};

const WORLD_LAT_LIMIT = 85;

/**
 * Builds a rounded-rectangle ring (array of [lon, lat] points) from a bbox,
 * with the corner radius specified in *screen pixels*.
 *
 * Works by projecting the bbox corners into pixel space (map.project),
 * drawing the rounded rect there, then unprojecting each point back to
 * lon/lat (map.unproject). This piggybacks on MapLibre's own projection
 * math, so it's correct at any zoom without reimplementing Mercator scale
 * factors ourselves.
 *
 * Caveat: assumes bearing = 0 / pitch = 0 (north-up, flat view). With
 * rotation or tilt, the projected bbox is no longer an axis-aligned screen
 * rectangle, so this bounding-boxes the 4 projected corners as an
 * approximation - fine for small rotations, slightly off at extremes.
 */
function createRoundedRectangle(
    map: maplibregl.Map,
    bbox: [[number, number], [number, number]],
    radiusPx: number,
    segmentsPerCorner = 12,
    clampThreshold = 0.5,
): [number, number][] {
    const [[west, south], [east, north]] = bbox;

    const sw = map.project([west, south]);
    const se = map.project([east, south]);
    const ne = map.project([east, north]);
    const nw = map.project([west, north]);

    const left = Math.min(sw.x, nw.x);
    const right = Math.max(se.x, ne.x);
    const top = Math.min(nw.y, ne.y); // screen y grows downward
    const bottom = Math.max(sw.y, se.y);

    const widthPx = right - left;
    const heightPx = bottom - top;

    // clamp radius so it never exceeds half the width/height at clampThreshold = 0.5
    const r = Math.max(0, Math.min(radiusPx, widthPx * clampThreshold, heightPx * clampThreshold));

    // Build corners in a local y-up plane (same layout as a meters plane
    // would use), then flip y -> screen space (y-down) right before
    // unprojecting.
    const corners = [
        { cx: r, cy: r, startAngle: 180, endAngle: 270 }, // bottom-left
        { cx: widthPx - r, cy: r, startAngle: 270, endAngle: 360 }, // bottom-right
        { cx: widthPx - r, cy: heightPx - r, startAngle: 0, endAngle: 90 }, // top-right
        { cx: r, cy: heightPx - r, startAngle: 90, endAngle: 180 }, // top-left
    ];

    const points: [number, number][] = [];

    for (const { cx, cy, startAngle, endAngle } of corners) {
        for (let i = 0; i <= segmentsPerCorner; i++) {
            const angle = startAngle + ((endAngle - startAngle) * i) / segmentsPerCorner;
            const rad = (angle * Math.PI) / 180;
            const localX = cx + r * Math.cos(rad);
            const localY = cy + r * Math.sin(rad);

            const pixelX = left + localX;
            const pixelY = bottom - localY; // local y-up -> screen y-down

            const { lng, lat } = map.unproject([pixelX, pixelY]);
            points.push([lng, lat]);
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
    const { current: mapRef } = useMap();

    // project()/unproject() depend on the map's current zoom/bearing/pitch.
    // useMemo can't "see" that from the `map` object reference alone, so we
    // bump this counter on the relevant events to force a recompute.
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!fit || !mapRef) return;
        mapRef.fitBounds(bbox, { padding: 40, animate: false });
    }, [fit, mapRef, bbox]);

    useEffect(() => {
        if (!mapRef) return;
        const onChange = () => setTick((t) => t + 1);
        mapRef.on("zoom", onChange);
        mapRef.on("rotate", onChange);
        mapRef.on("pitch", onChange);
        onChange();
        return () => {
            mapRef.off("zoom", onChange);
            mapRef.off("rotate", onChange);
            mapRef.off("pitch", onChange);
        };
    }, [mapRef]);

    const borderRing = useMemo(() => {
        const map = mapRef?.getMap();
        if (!map) return null;
        return createRoundedRectangle(map, bbox, radius, 24, 0.2);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapRef, bbox, radius, tick]);

    const borderFeature = useMemo(() => {
        if (!borderRing) return null;
        return {
            type: "Feature" as const,
            properties: {},
            geometry: {
                type: "Polygon" as const,
                coordinates: [borderRing],
            },
        };
    }, [borderRing]);

    const maskFeature = useMemo(() => {
        if (!borderRing) return null;
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

    if (!borderFeature || !maskFeature) return null;

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
