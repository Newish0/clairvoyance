import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useProtoMapsStyle } from "@/hooks/use-map-style";
import type { ComponentProps } from "react";

export const ProtoMap = (props: ComponentProps<typeof Map>) => {
    const mapStyle = useProtoMapsStyle();
    return (
        <Map
            initialViewState={{
                longitude: -123.35,
                latitude: 48.47,
                zoom: 14,
            }}
            {...props}
            style={{ width: "100%", height: "100%" }}
            mapStyle={mapStyle}
        ></Map>
    );
};
