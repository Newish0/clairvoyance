import { getQueryParams } from "@/utils/url";
import ArrivalBoard from "./ArrivalBoard";
import { useNearbyTransits } from "@/hooks/transit/nearby";
import { useEffect, useState } from "react";
import { debounce } from "@/utils/general";
import { useStore } from "@nanostores/react";
import { $globalLocation } from "@/stores/globallocation";

const GlobalArrivalBoard: React.FC = () => {
    const { lat, lng, radius } = useStore($globalLocation);
    return <ArrivalBoard lat={lat} lng={lng} radius={radius} />;
};

export default GlobalArrivalBoard;
