import { Protocol } from "pmtiles";
import layers from "protomaps-themes-base";
import { createMemo, onCleanup } from "solid-js";
import { useTheme } from "./use-theme";

import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export function useMapStyle() {
    const [, , isDark] = useTheme();

    let protocol = new Protocol();
    maplibre.addProtocol("pmtiles", protocol.tile);

    onCleanup(() => {
        maplibre.removeProtocol("pmtiles");
    });

    const mapStyle = createMemo(
        () =>
            ({
                version: 8,
                glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
                sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
                sources: {
                    protomaps: {
                        type: "vector",
                        url: `pmtiles://${import.meta.env.BASE_URL}map.pmtiles`,
                        attribution:
                            '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
                    },
                },
                layers: layers("protomaps", isDark() ? "dark" : "light", "en"),
            } as const)
    );

    return mapStyle;
}
