import { useRoute } from "@/hooks/transit/route";
import { useStopTimesByRoute, useStopTimesByTrip } from "@/hooks/transit/stoptimes";
import { cn } from "@/lib/utils";
import type { StopTimeByRouteData } from "@/services/api/transit";
import {
    formatHHMMSSFromSeconds, secondsUntilTime
} from "@/utils/datetime";
import { IconCircleX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import TransitTimeline from "../transittimeline";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";


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
            staticCountDownMin: Math.round(secondsUntilTime(st.arrival_timestamp) / 60),
            rtCountDownMin:
                st.stop_time_update?.arrival_delay !== null &&
                st.stop_time_update?.arrival_delay !== undefined
                    ? Math.round(
                          secondsUntilTime(
                              st.arrival_timestamp + st.stop_time_update?.arrival_delay
                          ) / 60
                      )
                    : null,
        }))
        .toSorted((a, b) => {
            const aTime = a.rtCountDownMin ?? a.staticCountDownMin;
            const bTime = b.rtCountDownMin ?? b.staticCountDownMin;
            return aTime - bTime;
        });

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
            <div className="flex justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-semibold">{route?.route_short_name}</h1>
                    <h3>
                        {selectedStopTime
                            ? selectedStopTime?.trip.trip_headsign
                            : route?.route_long_name}
                    </h3>
                </div>
                <a href="./">
                    <Button variant="ghost" size="icon">
                        <IconCircleX className="" />
                    </Button>
                </a>
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
                                    {stopTime.rtCountDownMin ? (
                                        <div className="text-xl font-semibold text-center">
                                            {stopTime.rtCountDownMin} min (rt)
                                        </div>
                                    ) : (
                                        <div className="text-xl font-semibold text-center">
                                            {stopTime.staticCountDownMin} min
                                        </div>
                                    )}

                                    <div>
                                        {stopTime.stop_time_update?.arrival_timestamp
                                            ? new Date(
                                                  parseInt(
                                                      stopTime.stop_time_update.arrival_timestamp
                                                  ) * 1000
                                              ).toLocaleTimeString()
                                            : formatHHMMSSFromSeconds(stopTime.arrival_timestamp)}
                                    </div>
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
