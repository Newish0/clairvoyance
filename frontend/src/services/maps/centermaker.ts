import L from "leaflet";

export function addCenterMarker(map: L.Map) {
    const centerMarker = L.circleMarker(map.getCenter(), {
        radius: 10,
        fillColor: "#6497d2",
        color: "#d4e6ea",
        fillOpacity: 1.0,
    }).addTo(map);

    function updateMarkerPosition() {
        centerMarker.setLatLng(map.getCenter());
    }

    map.on("move", updateMarkerPosition);
}
