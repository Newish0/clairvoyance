import { getQueryParams } from "@/utils/url";
import RouteDetails from "./RouteDetails.tsx";
import { useStore } from "@nanostores/react";
import { $globalNavParams } from "@/stores/navigationparams.ts";

const RouteDetailsFromParam: React.FC = () => {
    const globalNavParams = useStore($globalNavParams);

    if (!globalNavParams.routeId || !globalNavParams.stopId) {
        return (
            <>
                <div>Route not found</div>
                <pre>
                    <code>{JSON.stringify(globalNavParams)}</code>
                </pre>
            </>
        );
    }

    return (
        <RouteDetails
            routeId={globalNavParams.routeId}
            stopId={globalNavParams.stopId}
            defaultDirectionId={globalNavParams.directionId}
        />
    );
};

RouteDetailsFromParam.displayName = "RouteDetailsFromParam";
export default RouteDetailsFromParam;
