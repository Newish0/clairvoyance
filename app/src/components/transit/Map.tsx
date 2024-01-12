import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRealtimePosition, useShapes, useStops } from "@/components/hooks/transit";
import { TripInfoDrawer } from "@/components/transit/TripInfoDrawer";
import { calculateDistance } from "@/utils/compute";

type TripClickHandler = (tripId: string) => void;

interface MapProps {
    onTripClick?: TripClickHandler;
}

const Map = ({ onTripClick: handleTripClick }: MapProps) => {
    const mapContainerRef = useRef<null | HTMLDivElement>(null);
    const [map, setMap] = useState<L.Map>();
    const [mapCenter, setMapCenter] = useState<L.LatLng>();

    const { data: stopsGeoJson, isFetched: stopsIsFetched } = useStops({
        distance: 0,
        lat: 0,
        lon: 0,
    });
    const { data: shapesGeoJson, isFetched: shapesIsFetched } = useShapes({
        distance: 0,
        lat: 0,
        lon: 0,
    });

    const vehiclePositions = useRealtimePosition();

    const [focTripInfo, setFocTripInfo] = useState({
        tripId: "",
        yourLoc: {
            lat: 0,
            lng: 0,
        },
    });
    const [isTripDrawerOpen, setIsTripDrawerOpen] = useState(false);

    // Leaflet initialization (hooks into React)
    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Add a tile layer (e.g., OpenStreetMap)
        const osm = L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
            maxZoom: 19,
            detectRetina: true,
            // TODO: add proper attribution
        });

        // Initialize the map
        const map = L.map(mapContainerRef.current, {
            center: [48.4520342, -123.3159189],
            zoom: 13,
            layers: [osm],
        });

        const handleMapMoveEnd = () => {
            setMapCenter(map.getCenter());
        };

        map.on("moveend", handleMapMoveEnd);

        setMap(map);
        setMapCenter(map.getCenter()); // Initialization

        return () => {
            map.off();
            map.remove();
        };
    }, []);

    useEffect(() => {
        if (!map || !stopsGeoJson) return;
        const centerMarker = L.marker(map.getCenter(), {}).addTo(map);
        let midFlight = false;

        // Maintain center marker at center & snap to stops
        const updateCenterMarker = () => {
            const coord = map.getCenter();
            const closeStopCoord = stopsGeoJson?.features.find(({ geometry }) => {
                const d = calculateDistance(
                    geometry.coordinates[1],
                    geometry.coordinates[0],
                    coord.lat,
                    coord.lng
                );
                return d < 0.01 && d > 0.0001;
            })?.geometry.coordinates;

            if (closeStopCoord && !midFlight) {
                midFlight = true;
                map.flyTo(new L.LatLng(closeStopCoord[1], closeStopCoord[0]));
            }

            centerMarker.setLatLng(coord);
        };

        map.on("move", updateCenterMarker);
        map.on("zoomanim", updateCenterMarker);
        map.on("moveend", () => (midFlight = false));
        return () => {
            map.off("move", updateCenterMarker);
            map.off("zoomanim", updateCenterMarker);
        };
    }, [map, stopsGeoJson]);

    // Sync stops data with leaflet
    useEffect(() => {
        if (!stopsIsFetched) return;

        console.log("MAPS GEOJSON", stopsGeoJson);

        const geojsonMarkerOptions = {
            radius: 6,
            fillColor: "#3366ef",
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
        };

        const stopsLayer = L.geoJSON(stopsGeoJson, {
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, geojsonMarkerOptions);
            },
        });

        if (map) {
            stopsLayer.addTo(map);
        }

        return () => {
            if (map) stopsLayer.removeFrom(map);
        };
    }, [stopsGeoJson, stopsIsFetched, map]);

    // Sync shapes (lines) data with leaflet
    useEffect(() => {
        if (!shapesIsFetched) return;

        const shapesLayer = L.geoJSON(shapesGeoJson, {
            // Super lazy with the 'any' b/c we have schema validation at fetch
            style: function (feature: any) {
                return { color: feature.properties.route_color };
            },
        });

        if (map) shapesLayer.addTo(map);

        return () => {
            if (map) shapesLayer.removeFrom(map);
        };
    }, [shapesGeoJson, shapesIsFetched, map]);

    // Sync realtime bus position data with leaflet
    useEffect(() => {
        const markerOption = {
            radius: 10,
            fillColor: "#ef0055",
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
        };

        const rtPosLayer = L.layerGroup();
        for (const veh of vehiclePositions) {
            const marker = L.circleMarker([veh.latitude, veh.longitude], markerOption).bindPopup(
                JSON.stringify(veh, null, 2)
            );

            // Handle on marker click
            marker.addEventListener("click", () => {
                if (handleTripClick) {
                    handleTripClick(veh.trip_id ?? "");
                } else {
                    openTripDrawer({
                        tripId: veh.trip_id ?? "",
                    });
                }
            });

            marker.addTo(rtPosLayer);
        }

        if (map) rtPosLayer.addTo(map);

        return () => {
            if (map) rtPosLayer.removeFrom(map);
        };
    }, [vehiclePositions, map]);

    const openTripDrawer = ({
        tripId = "",
    }: {
        tripId?: string;
    } = {}) => {
        setFocTripInfo({
            tripId,
            yourLoc: {
                lat: 0,
                lng: 0,
            },
        });
        setIsTripDrawerOpen(true);
    };

    const handleTripDrawerClose = () => {
        setIsTripDrawerOpen(false);
    };

    return (
        <>
            <div ref={mapContainerRef} className="h-[75dvh] z-0"></div>
            {focTripInfo.tripId && (
                <TripInfoDrawer
                    isOpen={isTripDrawerOpen}
                    info={focTripInfo}
                    onClose={handleTripDrawerClose}
                />
            )}
        </>
    );
};

export default Map;
