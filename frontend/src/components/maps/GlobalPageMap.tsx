import { useEffect, useState } from "react";
import TransitMap from "./TransitMap";
import { getQueryParams } from "@/utils/url";
import { $globalLocation, setGlobalLocation } from "@/stores/globallocation";
import { useStore } from "@nanostores/react";
import { $globalNavParams } from "@/stores/navigationparams";

const GlobalPageMap: React.FC = () => {
    const globalLocation = useStore($globalLocation);
    const globalNavParams = useStore($globalNavParams);

    return (
        <TransitMap
            mode="main"
            routeId={globalNavParams.routeId}
            tripId={globalNavParams.directionId}
            onMoveEnd={(evt, map) => {
                setGlobalLocation(map.getCenter());
            }}
        />
    );
};

export default GlobalPageMap;
