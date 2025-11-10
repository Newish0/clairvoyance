import { DEFAULT_LOCATION } from "@/constants/location";
import { useProtoMapsStyle } from "@/hooks/use-map-style";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ComponentProps } from "react";
import Map, { AttributionControl } from "react-map-gl/maplibre";

export const ProtoMap = (props: ComponentProps<typeof Map>) => {
    const mapStyle = useProtoMapsStyle();

    return (
        <Map
            initialViewState={{
                longitude: DEFAULT_LOCATION.lng,
                latitude: DEFAULT_LOCATION.lat,
                zoom: 14,
            }}
            {...props}
            style={{ width: "100%", height: "100%" }}
            mapStyle={mapStyle}
            attributionControl={false}
        >
            <AttributionControl
                position="bottom-left"
                compact={true}
                style={{
                    opacity: 0.7,
                }}
            />
            {props.children}
        </Map>
    );
};
