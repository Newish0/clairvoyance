import { useOfflineAreas } from "@/hooks/use-offline-areas";
import { isPointInBbox } from "@/utils/geo";
import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";

const WORLD: [number, number][] = [
    [-180, -90],
    [180, -90],
    [180, 90],
    [-180, 90],
    [-180, -90],
];

const bboxRing = ([[w, s], [e, n]]: [[number, number], [number, number]]): [number, number][] => [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
];

const STRIPE_ID = "offline-zebra-stripe";

const SIZE = 32;
const BAND = 8;
const COLOR1 = [0, 0, 0, 128];
const COLOR2 = [0, 0, 0, 16];

function createStripeImage() {
    const data = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const isRed = Math.floor((x + y) / BAND) % 2 === 0;
            const [r, g, b, a] = isRed ? COLOR1 : COLOR2;
            const i = (y * SIZE + x) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
        }
    }
    return { width: SIZE, height: SIZE, data };
}

const DIVISIONS = 10; // grid lines across the shorter viewport axis
const PAD_FACTOR = 0.5; // generate a bit beyond the viewport so panning doesn't pop-in

const OutsideOfflineAreaLayer = () => {
    const { current: map } = useMap();
    const { areas } = useOfflineAreas();
    const [imageReady, setImageReady] = useState(false);
    const [view, setView] = useState<{ w: number; s: number; e: number; n: number } | null>(null);
    const downloaded = areas.filter((a) => a.state === "downloaded");

    useEffect(() => {
        if (!map) return;
        if (!map.hasImage(STRIPE_ID)) map.addImage(STRIPE_ID, createStripeImage());
        setImageReady(true);
        return () => {
            if (map && map.hasImage(STRIPE_ID)) map.removeImage(STRIPE_ID);
        };
    }, [map]);

    useEffect(() => {
        if (!map) return;
        const update = () => {
            const b = map.getBounds();
            setView({ w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() });
        };
        update();
        map.on("moveend", update);
        return () => {
            map.off("moveend", update);
        };
    }, [map]);

    const fillGeojson = useMemo<Feature<Polygon>>(
        () => ({
            type: "Feature",
            properties: {},
            geometry: {
                type: "Polygon",
                coordinates: [WORLD, ...downloaded.map((a) => bboxRing(a.bbox))],
            },
        }),
        [downloaded],
    );

    const labelGeojson = useMemo<FeatureCollection<LineString>>(() => {
        if (!view) return { type: "FeatureCollection", features: [] };

        const lonSpan = view.e - view.w;
        const latSpan = view.n - view.s;
        const step = Math.max(Math.min(lonSpan, latSpan) / DIVISIONS, 1e-6);

        const padLon = lonSpan * PAD_FACTOR;
        const padLat = latSpan * PAD_FACTOR;
        const west = view.w - padLon;
        const east = view.e + padLon;
        const south = view.s - padLat;
        const north = view.n + padLat;

        const features: FeatureCollection<LineString>["features"] = [];
        for (let lon = west; lon < east; lon += step) {
            for (let lat = south; lat < north; lat += step) {
                const midLon = lon + step / 2;
                const midLat = lat + step / 2;

                if (downloaded.some((a) => isPointInBbox({ lng: midLon, lat: midLat }, a.bbox))) {
                    continue;
                }

                features.push({
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "LineString",
                        coordinates: [
                            [lon, lat],
                            [lon + step, lat + step],
                        ],
                    },
                });
            }
        }
        return { type: "FeatureCollection", features };
    }, [view, downloaded]);

    if (!imageReady || downloaded.length === 0) return null;

    return (
        <>
            <Source id="offline-outside-fill-src" type="geojson" data={fillGeojson}>
                <Layer
                    id="offline-outside-fill"
                    type="fill"
                    paint={{ "fill-pattern": STRIPE_ID }}
                />
            </Source>
            <Source id="offline-outside-label-src" type="geojson" data={labelGeojson}>
                <Layer
                    id="offline-outside-label"
                    type="symbol"
                    layout={{
                        "symbol-placement": "line",
                        "symbol-spacing": 120,
                        "text-field": "AREA HAS NO OFFLINE DATA",
                        "text-size": 11,
                        "text-letter-spacing": 0.15,
                        "text-rotation-alignment": "map",
                        "text-keep-upright": false,
                    }}
                    paint={{
                        "text-color": "#fff",
                        "text-halo-color": "#000",
                        "text-halo-width": 1.2,
                    }}
                />
            </Source>
        </>
    );
};

export default OutsideOfflineAreaLayer;
