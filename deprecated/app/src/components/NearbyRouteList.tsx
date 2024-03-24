import type { WritableAtom } from "nanostores";
import { useStore } from "@nanostores/react";
import { useStops } from "./hooks/transit";
import RouteItem from "@/components/RouteItem.astro";

import { mapCenter } from "@/components/nanostores/mainMapStore";

interface NearbyRouteListProps {
    locationAtom?: WritableAtom<L.LatLng>;
}

export default function NearbyRouteList({ locationAtom }: NearbyRouteListProps) {
    const location = useStore(locationAtom ?? mapCenter);
    const { data: stops } = useStops({
        lat: location.lat,
        lng: location.lng,
        radius: 0.5,
    });

    return stops?.map((stop) => (
        // <RouteItem key={stop.stop_id} longName={123} shortName={321} stopName={"n/a"} minTillArrival={8} />
        <div key={stop.stop_id}> 
            {stop.stop_name}
        </div>
    ));
}
