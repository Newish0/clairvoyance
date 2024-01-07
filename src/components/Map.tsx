import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { groupBy } from "@/utils/convert";
import { useRealtimePosition, useShapes, useStops } from "./hooks/transit";
import LiveData from "@/services/transit/LiveData";

// const Map = () => {
//     const mapRef = useRef(null);

//     const { data: stopsGeoJson } = useStops({ distance: 0, lat: 0, lon: 0 });
//     const { data: shapesGeoJson } = useShapes({ distance: 0, lat: 0, lon: 0 });

//     useEffect(() => {
//         if (!mapRef.current) return;

//         // Initialize the map
//         const map = L.map(mapRef.current).setView([48.4520342, -123.3159189], 13);

//         // Add a tile layer (e.g., OpenStreetMap)
//         L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//             attribution: "© OpenStreetMap contributors",
//         }).addTo(map);

//         fetch("./api/transit/geojson/stops")
//             .then((res) => res.json())
//             .then((stops) => {
//                 console.log(stops);

//                 const geojsonMarkerOptions = {
//                     radius: 6,
//                     fillColor: "#3366ef",
//                     color: "#000",
//                     weight: 1,
//                     opacity: 1,
//                     fillOpacity: 0.8,
//                 };

//                 L.geoJSON(stops, {
//                     pointToLayer: function (feature, latlng) {
//                         return L.circleMarker(latlng, geojsonMarkerOptions);
//                     },
//                 }).addTo(map);
//             });

//         fetch("./api/transit/geojson/shapes")
//             .then((res) => res.json())
//             .then((shapes) => {
//                 L.geoJSON(shapes, {
//                     style: function (feature) {
//                         return { color: feature.properties.route_color };
//                     },
//                 }).addTo(map);
//             });

//         // Live Transit data

//         fetch("./api/transit/vehicle-positions")
//             .then((res) => res.json())
//             .then((vehiclePositions) => {
//                 console.log(vehiclePositions);

//                 const markerOption = {
//                     radius: 8,
//                     fillColor: "#ef0055",
//                     color: "#000",
//                     weight: 1,
//                     opacity: 1,
//                     fillOpacity: 0.8,
//                 };

//                 for (const pos of vehiclePositions) {
//                     const marker = L.circleMarker([pos.latitude, pos.longitude], markerOption);
//                     marker.addTo(map);
//                 }

//                 // const geojsonMarkerOptions = {
//                 //     radius: 6,
//                 //     fillColor: "#3366ef",
//                 //     color: "#000",
//                 //     weight: 1,
//                 //     opacity: 1,
//                 //     fillOpacity: 0.8,
//                 // };

//                 // L.geoJSON(stops, {
//                 //     pointToLayer: function (feature, latlng) {
//                 //         return L.circleMarker(latlng, geojsonMarkerOptions);
//                 //     },
//                 // }).addTo(map);
//             });
//     }, []); // Run only once when the component mounts

//     return <div ref={mapRef} style={{ height: "1000px" }}></div>;
// };

// export default Map;

const Map = () => {
    const mapContainerRef = useRef(null);
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

    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Add a tile layer (e.g., OpenStreetMap)
        const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
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

    useEffect(() => {
        if (!shapesIsFetched) return;

        console.log(shapesGeoJson);

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

    useEffect(() => {
        const markers: L.CircleMarker<any>[] = [];

        const markerOption = {
            radius: 10,
            fillColor: "#ef0055",
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
        };

        for (const pos of vehiclePositions) {
            console.log(pos);
            const marker = L.circleMarker([pos.latitude, pos.longitude], markerOption).bindPopup(
                JSON.stringify(pos, null, 2)
            );

            if (map) {
                marker.addTo(map);
                markers.push(marker);
            }
        }

        return () => {
            if (map) markers.forEach((m) => m.removeFrom(map));
        };
    }, [vehiclePositions, map]);

    return <div ref={mapContainerRef} style={{ height: "1000px" }}></div>;
};

export default Map;
