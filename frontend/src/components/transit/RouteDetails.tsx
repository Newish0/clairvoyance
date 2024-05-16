import { useRoute } from "@/hooks/transit/route";
import { useStopTimesByRouteId } from "@/hooks/transit/stoptimes";
import { formatHHMMSSFromSeconds, getSecondsSinceStartOfDay } from "@/utils/datetime";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { Separator } from "@radix-ui/react-separator";
import { useEffect } from "react";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import { Card, CardContent } from "../ui/card";

interface Props {
    routeId: string;
    stopId: string;
    defaultDirectionId?: string | number;
}

const RouteDetails: React.FC<Props> = ({ routeId, stopId, defaultDirectionId = 0 }) => {
    const { route } = useRoute(routeId);

    const { data: stopTimes } = useStopTimesByRouteId(routeId, stopId);

    const secondsSinceStartOfData = getSecondsSinceStartOfDay();
    const upcomingStopTimes = stopTimes
        ?.filter((st) => st.arrival_timestamp - secondsSinceStartOfData > 0)
        .map((st) => ({
            ...st,
            countDownMin: Math.round(
                ((st.arrival_timestamp % 86400) - secondsSinceStartOfData) / 60
            ),
        }));

    return (
        <div className="flex flex-col">
            <h1>Route Details</h1>
            <div>{routeId}</div>
            <div>{route?.route_long_name}</div>
            <div>{route?.route_short_name}</div>

            <div className="w-full">
                <Carousel
                    opts={{
                        align: "start",
                        dragFree: true,
                    }}
                    className="w-full"
                >
                    <CarouselContent>
                        {upcomingStopTimes?.map((stopTime) => (
                            <CarouselItem
                                key={stopTime.stop_sequence}
                                className="basis-1/3 max-w-sm"
                            >
                                <div className="p-1">
                                    <Card>
                                        <CardContent className="flex flex-col items-center justify-center p-6">
                                            <div className="text-xl font-semibold">
                                                {stopTime.countDownMin} min
                                            </div>
                                            <div>
                                                {formatHHMMSSFromSeconds(
                                                    stopTime.arrival_timestamp
                                                )}
                                            </div>
                                            {/* <pre>
                                                {
                                                    JSON.stringify(stopTime, null, 2)
                                                }
                                            </pre> */}
                                        </CardContent>
                                    </Card>
                                </div>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                </Carousel>
            </div>
        </div>
    );
};

export default RouteDetails;
