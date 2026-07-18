import { DEFAULT_LOCATION } from "@/constants/location";
import { useProtoMapsStyle } from "@/hooks/use-map-style";
import { useTileManifest } from "@/hooks/use-tile-manifest";
import { useMemoizedFn } from "ahooks";
import "maplibre-gl/dist/maplibre-gl.css";
import { useState, type ComponentProps } from "react";
import Map, { AttributionControl } from "react-map-gl/maplibre";
import OutsideOfflineAreaLayer from "./layers/outside-offline-area-layer";
import { useOnlineStatus } from "@/hooks/use-online-status";

type MapProps = ComponentProps<typeof Map>;
type ProtoMapProps = Omit<
    MapProps,
    "mapStyle" | "attributionControl" | "dragRotate" | "pitchWithRotate" | "touchPitch"
>;

const MANIFEST_URL = `${import.meta.env.BASE_URL}pmtiles/manifest.json`;

export const ProtoMap = ({ onMove, ...props }: ProtoMapProps) => {
    const [view, setView] = useState({
        lon: DEFAULT_LOCATION.lng,
        lat: DEFAULT_LOCATION.lat,
        zoom: 14,
    });
    const tilesUrl = useTileManifest(MANIFEST_URL, view.lon, view.lat, view.zoom);
    const mapStyle = useProtoMapsStyle(
        tilesUrl
            ? `${import.meta.env.BASE_URL}${tilesUrl}`
            : `${import.meta.env.BASE_URL}pmtiles/world-base.pmtiles`,
    );
    const { isOnline } = useOnlineStatus();

    const handleMove = useMemoizedFn((evt: Parameters<NonNullable<MapProps["onMove"]>>[0]) => {
        const { longitude: lon, latitude: lat, zoom } = evt.viewState;
        setView({ lon, lat, zoom });
        onMove?.(evt);
    });

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
            dragRotate={false}
            pitchWithRotate={false}
            touchPitch={false}
            onMove={handleMove}
        >
            <AttributionControl
                position="bottom-right"
                compact
                style={{ opacity: 0.7, margin: 0 }}
            />
            {isOnline ? null : <OutsideOfflineAreaLayer />}
            {props.children}
        </Map>
    );
};
