import { getParams } from "@/utils/url";
import RouteDetails from "./RouteDetails.tsx";

const RouteDetailsFromParam: React.FC = () => {
    const routeId = getParams("route_id") || "";
    return <RouteDetails routeId={routeId} stopId=""/>;
};

RouteDetailsFromParam.displayName = "RouteDetailsFromParam";
export default RouteDetailsFromParam;
