import { type Component } from "solid-js";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-solid";
import type { TripDetailsResponse } from "~/types";

interface OtherTripsProps {
    trips: TripDetailsResponse[];
}

export const OtherTrips: Component<OtherTripsProps> = (props) => {
    return (
        <Card>
            <CardContent>
                <h3 class="text-lg font-semibold">Other Trips</h3>
                <ul class="space-y-2">
                    {props.trips.map((trip) => (
                        <li key={trip.id} class="flex items-center justify-between">
                            <div class="flex items-center">
                                <Badge variant="secondary" class="mr-2">
                                    {trip.route.short_name}
                                </Badge>
                                <span class="text-sm">{trip.trip_headsign}</span>
                            </div>
                            <div class="flex items-center">
                                <Clock class="h-4 w-4 mr-1" />
                                <span class="text-sm">{trip.arrival_time}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
};