import { createResource, Show } from "solid-js";
import { getRouteDetails } from "~/services/gtfs/route";
import { getTripDetails } from "~/services/gtfs/trip";
import { Badge } from "../ui/badge";
import { getTripStops } from "~/services/gtfs/stops";
import { TransitRouteTimeline } from "~/components/ui/transit-timeline";
import { getArrivalMinutes } from "~/utils/time";
import RouteStopStopTimes from "./route-stop-stoptimes";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { TriangleAlert } from "lucide-solid";

interface TripDetailsProps {
    tripId: string;
    routeId: string;
    stopId: string;
}

const TripDetails = (props: TripDetailsProps) => {
    const [trip] = createResource(() => getTripDetails(props.tripId));
    const [route] = createResource(() => getRouteDetails(props.routeId));
    const [tripStops] = createResource(async () => {
        const stops = await getTripStops(props.tripId);
        const stopIndex = stops.findIndex((s) => s.stop_id === props.stopId);
        return {
            stops,
            stopIndex,
            currentStop: stops[stopIndex],
        };
    });

    return (
        <div class="h-full flex flex-col gap-3">
            <div class="flex items-center space-x-2">
                <Show when={route()}>
                    {(route) => (
                        <Badge variant="secondary" class="text-sm font-bold">
                            {route().short_name}
                        </Badge>
                    )}
                </Show>
                <div>
                    <Show when={trip()}>
                        {(trip) => <h4 class="font-semibold truncate">{trip().headsign}</h4>}
                    </Show>

                    <Show when={tripStops()}>
                        {(tripStops) => (
                            <p class="text-xs text-muted-foreground truncate">
                                At {tripStops().currentStop?.stop_name}
                            </p>
                        )}
                    </Show>
                </div>
            </div>

            <div>
                <RouteStopStopTimes
                    tripId={props.tripId}
                    routeId={props.routeId}
                    stopId={props.stopId}
                />
            </div>

            <div>
                {/* PLACEHOLDERS */}
                <Alert>
                    <TriangleAlert />
                    <AlertTitle>Alert Placeholder</AlertTitle>
                    <AlertDescription>
                        Some alert on this route.
                    </AlertDescription>
                </Alert>
            </div>

            <Show when={tripStops()}>
                {(tripStops) => (
                    <div class="max-h overflow-auto">
                        <TransitRouteTimeline
                            stops={tripStops().stops.map((s) => ({
                                stopName: s.stop_name,
                                stopTime: s.arrival_time,
                            }))}
                            activeStop={tripStops().stopIndex}
                        />
                        <div class="h-5/6">{/* Empty space */}</div>
                    </div>
                )}
            </Show>
        </div>
    );
};

export default TripDetails;
