import { getQueryParams } from "@/utils/url";
import RouteDetails from "./RouteDetails.tsx";

const RouteDetailsFromParam: React.FC = () => {
    const routeId = getQueryParams("route_id") || "";
    return <RouteDetails routeId={routeId} stopId=""/>;
};

RouteDetailsFromParam.displayName = "RouteDetailsFromParam";
export default RouteDetailsFromParam;
