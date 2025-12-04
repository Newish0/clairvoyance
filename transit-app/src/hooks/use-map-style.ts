import { useTheme } from "@/components/theme-provider";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { Protocol } from "pmtiles";
import maplibre from "maplibre-gl";
import { useEffect, useMemo } from "react";

export function useProtoMapsStyle() {
    const { displayedTheme } = useTheme();

    useEffect(() => {
        const protocol = new Protocol();
        maplibre.addProtocol("pmtiles", protocol.tile);
        return () => {
            maplibre.removeProtocol("pmtiles");
        };
    }, []);

    const mapStyle = useMemo(() => {
        const baseLayers = layers("protomaps", namedFlavor(displayedTheme), { lang: "en" });

        // Remove transit layers (includes bus stops/routes)
        const filteredLayers = baseLayers.filter((layer: any) => layer["source-layer"] !== "pois");

        const style = {
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
            layers: filteredLayers,
        } as const;

        return style;
    }, [displayedTheme]);

    return mapStyle;
}
