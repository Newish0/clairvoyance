import { onCleanup, type Component, type ComponentProps, createMemo, createEffect } from "solid-js";

import MapGL from "solid-map-gl";

import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { Protocol } from "pmtiles";

import layers from "protomaps-themes-base";
import { useTheme } from "~/hooks/use-theme";

type BaseMapProps = Omit<ComponentProps<typeof MapGL>, "options" | "mapLib">;

const BaseMap: Component<BaseMapProps> = (props) => {
    const [, , isDark] = useTheme();

    let protocol = new Protocol();
    maplibre.addProtocol("pmtiles", protocol.tile);

    onCleanup(() => {
        maplibre.removeProtocol("pmtiles");
    });

    const mapStyle = createMemo(() => ({
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
    }));

    return (
        <MapGL
            {...props}
            mapLib={maplibre}
            options={{
                style: mapStyle(),
            }}
        />
    );
};

export default BaseMap;
