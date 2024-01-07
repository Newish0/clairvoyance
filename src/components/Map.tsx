import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { groupBy } from "@/utils/convert";

const Map = () => {
    const mapRef = useRef(null);

    useEffect(() => {
        if (!mapRef.current) return;

        // Initialize the map
        const map = L.map(mapRef.current).setView([48.4520342, -123.3159189], 13);

        // Add a tile layer (e.g., OpenStreetMap)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
        }).addTo(map);

        fetch("./api/transit/geojson/stops")
            .then((res) => res.json())
            .then((stops) => {
                console.log(stops);

                const geojsonMarkerOptions = {
                    radius: 6,
                    fillColor: "#3366ef",
                    color: "#000",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8,
                };

                L.geoJSON(stops, {
                    pointToLayer: function (feature, latlng) {
                        return L.circleMarker(latlng, geojsonMarkerOptions);
                    },
                }).addTo(map);
            });

        fetch("./api/transit/geojson/shapes")
            .then((res) => res.json())
            .then((shapes) => {
                L.geoJSON(shapes, {
                    style: function (feature) {
                        return { color: feature.properties.route_color };
                    },
                }).addTo(map);
            });

        // Live Transit data

        fetch("./api/transit/vehicle-positions")
            .then((res) => res.json())
            .then((vehiclePositions) => {
                console.log(vehiclePositions);

                const markerOption = {
                    radius: 8,
                    fillColor: "#ef0055",
                    color: "#000",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8,
                };

                for (const pos of vehiclePositions) {
                    const marker = L.circleMarker([pos.latitude, pos.longitude], markerOption);
                    marker.addTo(map);
                }

                // const geojsonMarkerOptions = {
                //     radius: 6,
                //     fillColor: "#3366ef",
                //     color: "#000",
                //     weight: 1,
                //     opacity: 1,
                //     fillOpacity: 0.8,
                // };

                // L.geoJSON(stops, {
                //     pointToLayer: function (feature, latlng) {
                //         return L.circleMarker(latlng, geojsonMarkerOptions);
                //     },
                // }).addTo(map);
            });
    }, []); // Run only once when the component mounts

    return <div ref={mapRef} style={{ height: "1000px" }}></div>;
};

export default Map;
