import { useTrips } from "./hooks/transit";
import RouteItem from "@/components/RouteItem.astro";

export default function RouteList() {
    const { data: trips } = useTrips({ distance: 0, lat: 0, lon: 0 });

    return trips?.map((trip) => (
        <RouteItem
            longName={trip.trip_id}
            shortName={trip.trip_short_name ?? "n/a"}
            stopName={"n/a"}
            minTillArrival={8}
        />
    ));
}
