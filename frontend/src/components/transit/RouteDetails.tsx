import { useRoute } from "@/hooks/transit/route";
import { useStopTimesByRoute, useStopTimesByTrip } from "@/hooks/transit/stoptimes";
import {
    SECONDS_IN_A_DAY,
    formatHHMMSSFromSeconds,
    getSecondsSinceStartOfDay,
    secondsUntilTime,
} from "@/utils/datetime";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { Separator } from "@radix-ui/react-separator";
import { useEffect, useState } from "react";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import { Card, CardContent } from "../ui/card";
import TransitTimeline from "../transittimeline";
import type { StopTimeByRouteData } from "@/services/api/transit";
import { cn } from "@/lib/utils";
interface Props {
    routeId: string;
    stopId: string;
    direction?: string | number;
}

const RouteDetails: React.FC<Props> = ({ routeId, stopId, direction: defaultDirectionId = 0 }) => {
    const { data: route } = useRoute(routeId);

    const { data: stopTimes } = useStopTimesByRoute(routeId, stopId);

    const upcomingStopTimes = stopTimes
        ?.map((st) => ({
            ...st,
            countDownMin: Math.round(secondsUntilTime(st.arrival_timestamp) / 60),
        }))
        .toSorted((a, b) => a.countDownMin - b.countDownMin);

    useEffect(() => {
        setSelectedStopTime(upcomingStopTimes?.at(0));
    }, [stopTimes]);

    const [selectedStopTime, setSelectedStopTime] = useState<StopTimeByRouteData | undefined>(
        upcomingStopTimes?.at(0)
    );

    const { data: tripStopTimes } = useStopTimesByTrip(selectedStopTime?.trip_id ?? "");

    const ourStopTimeIndex = tripStopTimes?.findIndex((st) => st.stop_id === stopId);

    return (
        <div className="flex flex-col overflow-x-hidden p-2 gap-2">
            <div className="flex items-center gap-4">
                <h1 className="text-3xl font-semibold">{route?.route_short_name}</h1>
                <h3>
                    {selectedStopTime
                        ? selectedStopTime?.trip.trip_headsign
                        : route?.route_long_name}
                </h3>
            </div>

            <Carousel
                opts={{
                    align: "start",
                    dragFree: true,
                }}
                className=""
            >
                <CarouselContent>
                    {upcomingStopTimes?.map((stopTime) => (
                        <CarouselItem
                            key={`${stopTime.trip_id}-${stopTime.stop_sequence}`}
                            className="basis-1/3 sm:basis-1/4 max-w-56"
                            onClick={() => setSelectedStopTime(stopTime)}
                        >
                            <Card
                                className={cn(
                                    stopTime.trip_id === selectedStopTime?.trip_id
                                        ? "shadow"
                                        : "opacity-60 bg-muted"
                                )}
                            >
                                <CardContent className="flex flex-col items-center justify-center p-4">
                                    <div className="text-xl font-semibold text-center">
                                        {stopTime.countDownMin} min
                                    </div>
                                    <div>{formatHHMMSSFromSeconds(stopTime.arrival_timestamp)}</div>
                                    {/* <pre>
                                                {
                                                    JSON.stringify(stopTime, null, 2)
                                                }
                                            </pre> */}
                                </CardContent>
                            </Card>
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>

            <div className="w-full overflow-auto h-full">
                {tripStopTimes && (
                    <TransitTimeline
                        curStopIndex={ourStopTimeIndex ?? 0}
                        stops={
                            tripStopTimes?.map((st) => ({
                                title: st.stop.stop_name,
                                time: formatHHMMSSFromSeconds(st.arrival_timestamp),
                                id: st.stop_id,
                            })) ?? []
                        }
                    />
                )}
            </div>
        </div>
    );
};

export default RouteDetails;
