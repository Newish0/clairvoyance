import { useTheme } from "@/components/theme-provider";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { useMemo } from "react";

export function useProtoMapsStyle(activeTilesUrl: string) {
    const { displayedTheme } = useTheme();

    const mapStyle = useMemo(() => {
        const baseLayers = layers("protomaps", namedFlavor(displayedTheme), { lang: "en" });

        // Remove POI layers (includes bus stops/routes)
        const filteredLayers = baseLayers.filter((layer: any) => layer["source-layer"] !== "pois");

        const style = {
            version: 8,
            glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
            sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
            sources: {
                protomaps: {
                    type: "vector",
                    url: `pmtiles://${activeTilesUrl}`,
                    attribution:
                        '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
                },
            },
            layers: filteredLayers,
        } as const;

        return style;
    }, [displayedTheme, activeTilesUrl]);

    return mapStyle;
}
