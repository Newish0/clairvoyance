import L from "leaflet";

import "leaflet/dist/leaflet.css";

// Import the Leaflet MapTiler Plugin
import "@maptiler/leaflet-maptilersdk";
import { useEffect, useRef, useState } from "react";
import { addCenterMarker } from "@/services/maps/centermaker";
import { zoomFromCenter } from "@/services/maps/zoomfromcenter";
import { useShapes } from "@/hooks/transit/shapes";
import { useShapesGeojson } from "@/hooks/transit/geojson";
import { type RTVPData, getRtvp, getTrip, type TripData } from "@/services/api/transit";
import { debounce } from "@/utils/general";

import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "../ui/button";

type TransitMapProps = {
    mode: "route" | "main";
    routeId: string;
};

type RTVPDataModalData = TripData & RTVPData;

const TransitMap: React.FC<TransitMapProps> = ({ mode = "main", routeId }) => {
    const rootRef = useRef<null | HTMLDivElement>(null);

    const [map, setMap] = useState<L.Map | null>(null);

    const { data: shapesGeojson } = useShapesGeojson({ routeId });

    const [rtvpModalData, setRtvpModalData] = useState<RTVPDataModalData | null>(null);

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
                    const marker = L.marker(latLng, {
                        icon: L.divIcon({
                            html: `<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-bus"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M18 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 7 0 0 1 5 7v5h-2m-4 0h-8" /><path d="M16 5l1.5 7l4.5 0" /><path d="M2 10l15 0" /><path d="M7 5l0 5" /><path d="M12 5l0 5" /></svg>`,
                        }),
                    });

                    marker.on("click", () => {
                        console.log("clicked", rtvp);
                        getTrip(rtvp.trip_id, {
                            with_route: true,
                        }).then((trip) => {
                            console.log("trip", trip);
                            if (trip && trip.route) setRtvpModalData({ ...rtvp, ...trip });
                        });
                    });

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
            <div ref={rootRef} className="h-full min-h-[50dvh] z-0"></div>
            <div>MODE: {mode}</div>

            <Drawer open={rtvpModalData ? true : false} onClose={() => setRtvpModalData(null)}>
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle>{rtvpModalData?.route?.route_short_name}</DrawerTitle>
                        <DrawerDescription>{rtvpModalData?.trip_headsign}</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 pb-0">
                        <div className="text-sm text-muted-foreground">
                            Position: {rtvpModalData?.latitude} {rtvpModalData?.longitude}
                        </div>

                        <div className="text-sm text-muted-foreground">
                            Last updated: {rtvpModalData?.timestamp}
                        </div>

                        <div className="text-sm text-muted-foreground">
                            Trip ID: {rtvpModalData?.trip_id}
                        </div>

                      

                    </div>

                    <DrawerFooter>
                        <DrawerClose>
                            <Button variant="outline" onClick={() => setRtvpModalData(null)}>
                                Close
                            </Button>
                        </DrawerClose>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        </>
    );
};

TransitMap.displayName = "GlobalMap";

export default TransitMap;