import type { PixelBounds } from "@/hooks/map/use-selection-bbox";
import type { LngLatBounds, MapRef, MapGeoJSONFeature } from "react-map-gl/maplibre";

const PLACE_LAYERS = ["places_locality", "places_subplace", "places_region", "places_country"];
const ROAD_LAYERS = ["roads_highway", "roads_major", "roads_minor", "roads_link", "roads_other"];

const PLACE_KIND_RANK: Record<string, number> = {
    neighbourhood: 3,
    macrohood: 3,
    locality: 2,
    region: 1,
    country: 0,
};

const roadRank = (f: MapGeoJSONFeature) => ROAD_LAYERS.length - ROAD_LAYERS.indexOf(f.layer.id);

export function inferAreaName(
    map: MapRef | undefined,
    pixelBounds: PixelBounds,
    bounds: LngLatBounds,
): string {
    if (!map) return fallbackName(bounds);

    const centerPx = midpoint(pixelBounds);

    // stage 1: nearest place label anywhere in the current viewport - not
    // restricted to the tiny selection box, since at high zoom the box is
    // too small to ever contain a rendered label glyph
    const places = map.queryRenderedFeatures(undefined, { layers: PLACE_LAYERS });
    const bestPlace = closest(
        places,
        map,
        centerPx,
        (f) => PLACE_KIND_RANK[f.properties?.kind] ?? 0,
    );
    if (bestPlace?.properties?.name) return bestPlace.properties.name;

    // stage 2: small area, nothing named nearby - fall back to the street
    // actually running through the selection (line geometry, not a label)
    const roads = map.queryRenderedFeatures(pixelBounds, { layers: ROAD_LAYERS });
    const bestRoad = closest(roads, map, centerPx, roadRank);

    if (bestRoad?.properties?.name) {
        const crossRoad = closest(
            roads.filter(
                (f) => f.properties?.name && f.properties.name !== bestRoad.properties.name,
            ),
            map,
            centerPx,
            roadRank,
        );
        return crossRoad?.properties?.name
            ? `Near ${bestRoad.properties.name} & ${crossRoad.properties.name}`
            : `Near ${bestRoad.properties.name}`; // ponytail: only one named road nearby, single-street fallback stands
    }

    return fallbackName(bounds);
}

function midpoint([[x1, y1], [x2, y2]]: PixelBounds): [number, number] {
    return [(x1 + x2) / 2, (y1 + y2) / 2];
}

function firstCoord(coords: unknown): [number, number] | null {
    if (!Array.isArray(coords)) return null;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        return coords as [number, number];
    }
    return firstCoord(coords[0]); // recurse: MultiLineString -> LineString -> Point, Polygon -> ring -> Point, etc.
}

function featureAnchorPx(feature: MapGeoJSONFeature, map: MapRef): [number, number] | null {
    const lngLat = firstCoord(
        (feature.geometry as GeoJSON.Geometry & { coordinates?: unknown }).coordinates,
    );
    if (!lngLat) return null;
    const { x, y } = map.project(lngLat);
    return [x, y];
}

function closest(
    features: MapGeoJSONFeature[],
    map: MapRef,
    centerPx: [number, number],
    priority: (f: MapGeoJSONFeature) => number,
): MapGeoJSONFeature | undefined {
    return features
        .map((f) => {
            const anchor = featureAnchorPx(f, map);
            return anchor
                ? { f, dist: Math.hypot(anchor[0] - centerPx[0], anchor[1] - centerPx[1]) }
                : null;
        })
        .filter((x): x is { f: MapGeoJSONFeature; dist: number } => x !== null) // drop features with no usable coord
        .sort((a, b) => priority(b.f) - priority(a.f) || a.dist - b.dist)[0]?.f;
}

function fallbackName(bounds: LngLatBounds): string {
    const center = bounds.getCenter();
    return `Area (${center.lat.toFixed(2)}, ${center.lng.toFixed(2)})`;
}
