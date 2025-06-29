import { Badge } from "@/components/ui/badge";
import { differenceInSeconds, type DateArg } from "date-fns";
import { Clock } from "lucide-solid";
import { Show, type Component } from "solid-js";
import { cn } from "~/lib/utils";
import { recordToSearchParams } from "~/utils/urls";
import TripTime from "../ui/departure-time";
import RealTimeIndicator from "../ui/realtime-indicator";

export interface DepartureCardKeyProps {
    routeId: string;
    routeShortName: string;
    tripObjectId: string;
    tripHeadsign: string;
    stopId: string;
    stopName: string;
    scheduledDepartureTime: DateArg<Date>;
    predictedDepartureTime?: DateArg<Date> | null;
    isCancelled?: boolean;
    isLastStop: boolean;
}

export interface DepartureCardProps extends DepartureCardKeyProps {
    alt?: {
        routeId: string;
        tripObjectId?: string;
        stopId: string;
    };
}

export const DepartureCard: Component<DepartureCardProps> = (props) => {
    const departureTime = () => props.predictedDepartureTime ?? props.scheduledDepartureTime;

    const delayInSeconds = () =>
        props.predictedDepartureTime
            ? differenceInSeconds(props.predictedDepartureTime, props.scheduledDepartureTime)
            : null;

    const queryParams = () =>
        recordToSearchParams({
            route: props.routeId,
            stop: props.stopId,
            trip: props.tripObjectId,
            ...(props.alt
                ? {
                      alt_route: props.alt.routeId,
                      alt_stop: props.alt.stopId,
                      ...(props.alt.tripObjectId ? { alt_trip: props.alt.tripObjectId } : {}),
                  }
                : {}),
        });

    const tripTimeType = () => (props.isLastStop ? "arrival" : "departure");

    return (
        <a href={`${import.meta.env.BASE_URL}app/next-trips/?${queryParams()}`}>
            <div class="flex items-center justify-between py-2 border-b last:border-b-0">
                <div class="overflow-hidden">
                    <div class="flex items-center gap-2">
                        <div class="w-12 flex-shrink-0 flex justify-center">
                            <Badge variant="secondary" class="text-sm font-bold">
                                {props.routeShortName}
                            </Badge>
                        </div>

                        <div class="space-y-1 overflow-hidden">
                            <h4 class="text-sm font-semibold text-wrap">{props.tripHeadsign}</h4>
                            <p class="text-xs text-muted-foreground truncate">
                                At {props.stopName}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="relative overflow-visible p-2 mr-1 min-w-16">
                    <div
                        class={cn(
                            "flex items-center justify-end space-x-1 h-8",
                            props.isCancelled ? "line-through text-muted-foreground" : ""
                        )}
                    >
                        <Clock class="h-3 w-3" />
                        <TripTime datetime={departureTime()} type={tripTimeType()} />
                    </div>

                    <Show when={typeof delayInSeconds() === "number"}>
                        <RealTimeIndicator delay={delayInSeconds()} />
                    </Show>

                    {/* <Show when={import.meta.env.DEV && props.predictedDepartureTime}>
                        <code class="text-muted-foreground text-xs">
                            ({props.scheduledDepartureTime.toLocaleTimeString()} →{" "}
                            {props.predictedDepartureTime.toLocaleTimeString()}, Δ {delayInSeconds}
                            s)
                        </code>
                    </Show> */}
                </div>
            </div>
        </a>
    );
};
