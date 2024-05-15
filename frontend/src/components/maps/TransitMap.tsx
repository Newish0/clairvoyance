import L from "leaflet";

import "leaflet/dist/leaflet.css";

// Import the Leaflet MapTiler Plugin
import "@maptiler/leaflet-maptilersdk";
import { useEffect, useRef, useState } from "react";
import { addCenterMarker } from "@/services/maps/centermaker";
import { zoomFromCenter } from "@/services/maps/zoomfromcenter";
import { useShapesGeojson } from "@/hooks/transit/geojson";
import { type RTVPData, getRtvpByLoc, getTrip, type TripData } from "@/services/api/transit";
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
import { useRtvpByRouteId, useRtvpByTripId } from "@/hooks/transit/rtvp";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    LabelList,
} from "recharts";

type TransitMapEventHandler = (evt: L.LeafletEvent, map: L.Map) => void;

type TransitMapProps = {
    tripId?: string;
    defaultPosition?: L.LatLng;
    onMoveEnd?: TransitMapEventHandler;
};

type RTVPDataModalData = TripData & RTVPData;

const TransitMap: React.FC<TransitMapProps> = ({
    tripId,
    defaultPosition,
    onMoveEnd: moveEndHandler,
}) => {
    const rootRef = useRef<null | HTMLDivElement>(null);

    const [map, setMap] = useState<L.Map | null>(null);

    const { data: shapesGeojson } = useShapesGeojson({ tripId });

    const [rtvpModalData, setRtvpModalData] = useState<RTVPDataModalData | null>(null);

    const { data: tripRtvpData } = useRtvpByTripId(rtvpModalData?.trip_id ?? "");
    const { data: routeRtvpData } = useRtvpByRouteId(
        rtvpModalData?.route_id ?? "",
        rtvpModalData?.direction_id ?? 0
    );

    console.log("tripRtvpData", tripRtvpData);
    console.log("routeRtvpData", routeRtvpData);
    console.log("shapesGeojson", shapesGeojson);

    useEffect(() => {
        if (!rootRef.current) return;

        const map = L.map(rootRef.current, {
            center: defaultPosition,
            zoom: 13,
        });

        // FIXME: Use local open tiles
        // MapTiler layer is tmp solution for dev
        // @ts-ignore
        const mtLayer = new L.MaptilerLayer({
            apiKey: import.meta.env.PUBLIC_MAPTILER_API_KEY,
            style: "dataviz",
        }).addTo(map);

        // zoomFromCenter(map);
        addCenterMarker(map);

        const rtvpMarkers: L.Marker<any>[] = [];
        const updateRtvp = debounce(() => {
            if (!map) return;
            const bounds = map.getBounds();
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            const latitudeDifference = ne.lat - sw.lat;
            const longitudeDifference = ne.lng - sw.lng;

            getRtvpByLoc({
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
        const wrappedHandler = (evt: L.LeafletEvent) => {
            if (map && moveEndHandler) moveEndHandler(evt, map);
        };

        if (map) map.on("moveend", wrappedHandler);

        return () => {
            if (map) map.off("moveend", wrappedHandler);
        };
    }, [map, moveEndHandler]);

    useEffect(() => {
        let geoJsonLayer: L.GeoJSON | null = null;
        if (shapesGeojson && map) {
            geoJsonLayer = L.geoJSON(shapesGeojson);
            setTimeout(() => geoJsonLayer?.addTo(map), 1000);
        }

        return () => {
            geoJsonLayer?.remove()
        };
    }, [map, shapesGeojson]);

    return (
        <>
            <div ref={rootRef} className="h-full min-h-[50dvh] z-0"></div>

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
                        <div className="text-sm text-muted-foreground">
                            Direction: {rtvpModalData?.direction_id}
                        </div>

                        <div className="w-full h-96">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart width={600} height={400} data={tripRtvpData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="elapsed" type="number" />
                                    <YAxis type="number" />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="p_traveled" stroke="#8884d8" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="w-full h-96">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart width={600} height={400}>
                                    <CartesianGrid />
                                    <XAxis type="number" dataKey="elapsed" />
                                    <YAxis type="number" dataKey="p_traveled" />
                                    <Scatter data={routeRtvpData} fill="#8884d8" />
                                </ScatterChart>
                            </ResponsiveContainer>
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
