import { useEffect, useState } from "react";
import TransitMap from "./TransitMap";
import { getQueryParams } from "@/utils/url";
import { $globalLocation, setGlobalLocation } from "@/stores/globallocation";
import { useStore } from "@nanostores/react";

const GlobalPageMap: React.FC = () => {
    const [routeId, setRouteId] = useState<string>("");

    const globalLocation = useStore($globalLocation);

    useEffect(() => {
        console.log("GlobalPageMap mounted");
        setRouteId(getQueryParams("route_id") ?? "");
    }, [getQueryParams("route_id")]);

    return (
        <TransitMap
            mode="main"
            routeId={routeId}
            onMoveEnd={(evt, map) => {
                setGlobalLocation(map.getCenter());
            }}
        />
    );
};

export default GlobalPageMap;
