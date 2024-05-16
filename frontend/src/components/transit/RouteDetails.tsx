import { useRoute } from "@/hooks/transit/route";
import { useStopTimesByRoute, useStopTimesByTrip } from "@/hooks/transit/stoptimes";
import { formatHHMMSSFromSeconds, getSecondsSinceStartOfDay } from "@/utils/datetime";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { Separator } from "@radix-ui/react-separator";
import { useEffect, useState } from "react";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import { Card, CardContent } from "../ui/card";
import TransitTimeline from "../transittimeline";
interface Props {
    routeId: string;
    stopId: string;
    defaultDirectionId?: string | number;
}

const RouteDetails: React.FC<Props> = ({ routeId, stopId, defaultDirectionId = 0 }) => {
    const { route } = useRoute(routeId);

    const { data: stopTimes } = useStopTimesByRoute(routeId, stopId);

    const [selectedTrip, setSelectedTrip] = useState<string | null>(null);

    const { data: tripStopTimes } = useStopTimesByTrip(selectedTrip ?? "");

    const secondsSinceStartOfData = getSecondsSinceStartOfDay();
    const upcomingStopTimes = stopTimes
        ?.filter((st) => st.arrival_timestamp - secondsSinceStartOfData > 0)
        .map((st) => ({
            ...st,
            countDownMin: Math.round(
                ((st.arrival_timestamp % 86400) - secondsSinceStartOfData) / 60
            ),
        }));

    const handleSelectTrip = (tripId: string) => {
        setSelectedTrip(tripId);
    };

    const ourStopTimeIndex = tripStopTimes?.findIndex((st) => st.stop_id === stopId);

    return (
        <div className="flex flex-col overflow-x-hidden">
            <h1>Route Details</h1>
            <div>{routeId}</div>
            <div>{route?.route_long_name}</div>
            <div>{route?.route_short_name}</div>

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
                            key={stopTime.stop_sequence}
                            className="basis-1/3 max-w-xs"
                            onClick={() => handleSelectTrip(stopTime.trip_id)}
                        >
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center p-6">
                                    <div className="text-xl font-semibold">
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

            <div className="w-full p-4 overflow-auto h-full">
                <TransitTimeline
                    curStopIndex={ourStopTimeIndex ?? 0}
                    stops={
                        tripStopTimes?.map((st) => ({
                            title: st.stop.stop_name,
                            time: formatHHMMSSFromSeconds(st.arrival_timestamp),
                        })) ?? []
                    }
                />
            </div>
        </div>
    );
};

export default RouteDetails;
