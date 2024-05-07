import React from "react";
import { useNearbyTransits } from "@/hooks/transit/nearby";
import { ScrollArea } from "../ui/scroll-area";
import type { NearbyTransit } from "@/services/api/transit";

import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import { Card } from "../ui/card";
import { IconCircleArrowRight, IconCircleArrowLeft } from "@tabler/icons-react";
import { getSecondsSinceStartOfDay } from "@/utils/datetime";

const DirectionArrow = ({ direction }: { direction: number }) => {
    if (direction === 0) {
        return <IconCircleArrowRight className="m-[-2px] size-5" />;
    } else if (direction === 1) {
        return <IconCircleArrowLeft className="m-[-2px] size-5" />;
    } else {
        return null;
    }
};

const BoardRow = ({ route_id, route_short_name, trips }: NearbyTransit) => {
    console.log(route_id, trips);

    const secSinceStartOfDate = getSecondsSinceStartOfDay();

    return (
        <Carousel>
            <CarouselContent>
                {trips.map((trip) => {
                    const etaSec = trip.stop_time.arrival_timestamp - secSinceStartOfDate; // FIXME: Broken for trips with time past 12:00AM
                    const etaMin = (etaSec / 60).toFixed(0);

                    return (
                        <CarouselItem key={trip.trip_id}>
                            <a href={`/routes?route_id=${route_id}`}>
                                <div className="m-2 p-4 rounded-xl border bg-card text-card-foreground shadow">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <h3 className="text-xl font-semibold mb-1">
                                                {route_short_name}
                                            </h3>
                                            <p className="text-muted-foreground mb-1 flex gap-1 items-center">
                                                <DirectionArrow direction={trip.direction_id} />
                                                {trip.trip_headsign}
                                            </p>
                                        </div>
                                        <div className=" flex items-center justify-end">
                                            <h3 className="text-muted-foreground text-xl font-semibold mb-2 ">
                                                {etaMin} min
                                            </h3>
                                        </div>
                                    </div>
                                </div>
                            </a>
                        </CarouselItem>
                    );
                })}
            </CarouselContent>
        </Carousel>
    );
};

type ArrivalBoardProps = {
    lat: number;
    lng: number;
    radius: number;
};

const ArrivalBoard: React.FC<ArrivalBoardProps> = ({ lat, lng, radius }) => {
    const { data: nearbyTransits } = useNearbyTransits({ lat, lng, radius });

    return (
        <>
            {nearbyTransits?.map((nbt) => (
                <BoardRow key={nbt.route_id} {...nbt}></BoardRow>
            ))}
        </>
    );
};

export default ArrivalBoard;
