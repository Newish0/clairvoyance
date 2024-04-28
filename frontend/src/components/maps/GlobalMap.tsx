import L from "leaflet";

import "leaflet/dist/leaflet.css";

// Import the Leaflet MapTiler Plugin
import "@maptiler/leaflet-maptilersdk";
import { useEffect, useRef } from "react";
import { addCenterMarker } from "@/services/maps/centermaker";
import { zoomFromCenter } from "@/services/maps/zoomfromcenter";

const GlobalMap: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => {
    const rootRef = useRef<null | HTMLDivElement>(null);

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
            style: "dataviz"
        }).addTo(map);


        // zoomFromCenter(map);
        addCenterMarker(map);

        return () => {
            map.remove();
        };
    }, [rootRef.current]);

    return <div ref={rootRef} className="h-full min-h-[50dvh]"></div>;
};

GlobalMap.displayName = "GlobalMap";

export default GlobalMap;
