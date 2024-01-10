import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { groupBy } from "@/utils/convert";
import { useRealtimePosition, useShapes, useStops } from "./hooks/transit";
import LiveData from "@/services/transit/LiveData";

const Map = () => {
    const mapContainerRef = useRef<null | HTMLDivElement>(null);
    const [map, setMap] = useState<L.Map>();

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

        setMap(map);

        return () => {
            map.off();
            map.remove();
        };
    }, []);

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
        for (const pos of vehiclePositions) {
            const marker = L.circleMarker([pos.latitude, pos.longitude], markerOption).bindPopup(
                JSON.stringify(pos, null, 2)
            );

            // Handle on marker click
            marker.addEventListener("click", () => {
                // TODO
                throw new Error("No implementation.");
            });

            marker.addTo(rtPosLayer);
        }

        if (map) rtPosLayer.addTo(map);

        return () => {
            if (map) rtPosLayer.removeFrom(map);
        };
    }, [vehiclePositions, map]);

    return <div ref={mapContainerRef} className="h-[75dvh]"></div>;
};

export default Map;
