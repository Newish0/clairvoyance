import { useRoute } from "@/hooks/transit/route";
import { useEffect } from "react";

interface Props {
    routeId: string;
    stopId: string;
}

const RouteDetails: React.FC<Props> = ({ routeId, stopId }) => {
    const { route } = useRoute(routeId);

    return (
        <div>
            <h1>Route Details</h1>
            <div>{routeId}</div>
            <div>{route?.route_long_name}</div>
            <div>{route?.route_short_name}</div>
        </div>
    );
};

export default RouteDetails;