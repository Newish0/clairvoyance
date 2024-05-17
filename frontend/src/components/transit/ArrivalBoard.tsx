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
import { SECONDS_IN_A_DAY, getSecondsSinceStartOfDay } from "@/utils/datetime";
import { useRtvpEta } from "@/hooks/transit/rtvp";

const DirectionArrow = ({ direction }: { direction: number }) => {
    if (direction === 0) {
        return <IconCircleArrowRight className="m-[-2px] size-5" />;
    } else if (direction === 1) {
        return <IconCircleArrowLeft className="m-[-2px] size-5" />;
    } else {
        return null;
    }
};

const TripItem = ({
    tripId,
    arrivalTimestamp,
    routeId,
    routeShortName,
    tripHeadSign,
    tripDirectionId,
    arrivalDelaySec,
    stopId,
}: {
    tripId: string;
    arrivalTimestamp: number;
    routeId: string;
    routeShortName: string;
    tripHeadSign: string;
    tripDirectionId: number;
    arrivalDelaySec?: number | null;
    stopId: string;
}) => {
    const secSinceStartOfDate = getSecondsSinceStartOfDay();

    const staticAbsEtaSec = (arrivalTimestamp % SECONDS_IN_A_DAY) - secSinceStartOfDate;
    const staticEtaSec =
        staticAbsEtaSec < 0 ? staticAbsEtaSec + secSinceStartOfDate : staticAbsEtaSec;
    const staticEtaMin = Math.round(staticEtaSec / 60);

    // const { data } = useRtvpEta(tripId, stopId);

    // const rtvpEtaMin = (data && Math.round(data.eta / 60)) ?? null;
    const rtvpEtaMin =
        (arrivalDelaySec && Math.round((arrivalDelaySec + staticEtaSec) / 60)) ?? null;

    return (
        <CarouselItem className="flex-grow h-full">
            <a
                href={`/routes?routeId=${routeId}&directionId=${tripDirectionId}&stopId=${stopId}&tripId=${tripId}`}
            >
                <div className="m-2 p-4 rounded-xl border bg-card text-card-foreground shadow">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <h3 className="text-xl font-semibold mb-1">{routeShortName}</h3>
                            <p className="text-muted-foreground mb-1 flex gap-1 items-center">
                                <DirectionArrow direction={tripDirectionId} />
                                {tripHeadSign}
                            </p>
                        </div>
                        <div className="flex items-center justify-end">
                            {rtvpEtaMin === null && (
                                <h3 className="text-muted-foreground text-xl font-semibold mb-2">
                                    {staticEtaMin} min
                                </h3>
                            )}
                            {rtvpEtaMin !== null && (
                                <div className="flex items-center flex-col">
                                    <h3 className="text-xl font-semibold mb-2">{rtvpEtaMin} min</h3>
                                    <small className="text-muted-foreground">
                                        {staticEtaMin} min{" "}
                                        {rtvpEtaMin - staticEtaMin > 0 ? "+" : ""}{" "}
                                        {rtvpEtaMin - staticEtaMin}
                                    </small>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </a>
        </CarouselItem>
    );
};

const BoardRow = ({ route_id, route_short_name, trips }: NearbyTransit) => {
    console.log(route_id, trips);

    return (
        <Carousel>
            <CarouselContent>
                {trips.map((trip) => (
                    <TripItem
                        key={trip.trip_id}
                        arrivalTimestamp={trip.stop_time.arrival_timestamp}
                        routeId={trip.route_id}
                        routeShortName={route_short_name}
                        tripHeadSign={trip.trip_headsign}
                        tripDirectionId={trip.direction_id}
                        tripId={trip.trip_id}
                        stopId={trip.stop_time.stop_id}
                        arrivalDelaySec={trip.stop_time.stop_time_update?.arrival_delay}
                    />
                ))}
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
        <ScrollArea>
            {nearbyTransits?.map((nbt) => (
                <BoardRow key={nbt.route_id} {...nbt}></BoardRow>
            ))}
        </ScrollArea>
    );
};

export default ArrivalBoard;
