import L from "leaflet";

import "leaflet/dist/leaflet.css";

// Import the Leaflet MapTiler Plugin
import "@maptiler/leaflet-maptilersdk";
import { useEffect, useRef, useState } from "react";
import { addCenterMarker } from "@/services/maps/centermaker";
import { zoomFromCenter } from "@/services/maps/zoomfromcenter";
import { useShapes } from "@/hooks/transit/shapes";
import { useShapesGeojson } from "@/hooks/transit/geojson";
import { getRtvp } from "@/services/api/transit";
import { debounce } from "@/utils/general";

type TransitMapProps = {
    mode: "route" | "main";
    routeId: string;
};

const TransitMap: React.FC<TransitMapProps> = ({ mode = "main", routeId }) => {
    const rootRef = useRef<null | HTMLDivElement>(null);

    const [map, setMap] = useState<L.Map | null>(null);

    const { data: shapesGeojson } = useShapesGeojson({ routeId });

    useEffect(() => {
        if (!rootRef.current) return;

        const map = L.map(rootRef.current, {
            center: L.latLng(48.45, -123.35),
            zoom: 13,
        });

        // FIXME: Use local open tiles
        // MapTiler layer is tmp solution for dev
        const mtLayer = new L.MaptilerLayer({
            apiKey: import.meta.env.PUBLIC_MAPTILER_API_KEY,
            style: "dataviz",
        }).addTo(map);

        // zoomFromCenter(map);
        addCenterMarker(map);

        const rtvpMarkers: L.Marker<any>[] = [];
        const updateRtvp = debounce(() => {
            const bounds = map.getBounds();
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            const latitudeDifference = ne.lat - sw.lat;
            const longitudeDifference = ne.lng - sw.lng;

            getRtvp({
                lat: map.getCenter().lat,
                lng: map.getCenter().lng,
                radius: Math.max(
                    latitudeDifference * 110.574,
                    longitudeDifference * 111.32 * Math.cos(latitudeDifference)
                ),
            }).then((data) => {
                rtvpMarkers.forEach((marker) => {
                    map.removeLayer(marker);
                });
                data.map((rtvp) => {
                    const latLng = L.latLng(rtvp.latitude, rtvp.longitude);
                    const marker = L.marker(latLng);
                    marker.addTo(map);
                    rtvpMarkers.push(marker);
                });
            });
        }, 100);

        map.on("move", updateRtvp);
        updateRtvp();
        const rtvpInterval = setInterval(updateRtvp, 5000);

        setMap(map);

        return () => {
            map.remove();
            setMap(null);

            clearInterval(rtvpInterval);
        };
    }, [rootRef.current]);

    useEffect(() => {
        if (shapesGeojson && map) {
            const geoJsonLayer = L.geoJSON(shapesGeojson);
            geoJsonLayer.addTo(map);
        }
        // add geo json as layer to map
    }, [map, mode, shapesGeojson]);

    console.log(routeId);

    return (
        <>
            <div ref={rootRef} className="h-full min-h-[50dvh]"></div>
            <div>MODE: {mode}</div>
        </>
    );
};

TransitMap.displayName = "GlobalMap";

export default TransitMap;
