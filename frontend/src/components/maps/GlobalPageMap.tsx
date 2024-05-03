import { useEffect, useState } from "react";
import TransitMap from "./TransitMap";
import { getParams } from "@/utils/url";

const GlobalPageMap: React.FC = () => {

    const [routeId, setRouteId] = useState<string>("");

    useEffect(() => {
        console.log("GlobalPageMap mounted");
        setRouteId(getParams("route_id") ?? "");
    }, [getParams("route_id")])

    return <TransitMap mode="main" routeId={routeId} />;
};

export default GlobalPageMap;
