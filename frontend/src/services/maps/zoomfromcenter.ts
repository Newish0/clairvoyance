import L from "leaflet";

export function zoomFromCenter(map: L.Map) {
    let center = map.getCenter();
    
    map.on("zoomstart", (evt) => {
        center = map.getCenter();
    });

    map.on("zoomanim", (evt) => {
        evt.center = center;
    });
}
