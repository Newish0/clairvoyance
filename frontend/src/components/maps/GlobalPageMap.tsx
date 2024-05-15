import { useEffect, useState } from "react";
import TransitMap from "./TransitMap";
import { getQueryParams } from "@/utils/url";
import { $globalLocation, setGlobalLocation } from "@/stores/globallocation";
import { useStore } from "@nanostores/react";
import { $globalNavParams } from "@/stores/navigationparams";
import { latLng } from "leaflet";

const GlobalPageMap: React.FC<{}> = ({}) => {
    const globalLocation = useStore($globalLocation);
    const globalNavParams = useStore($globalNavParams);

    return (
        <TransitMap
            tripId={globalNavParams.tripId}
            defaultPosition={latLng(globalLocation.lat, globalLocation.lng)}
            onMoveEnd={(evt, map) => {
                setGlobalLocation(map.getCenter());
            }}
        />
    );
};

export default GlobalPageMap;
