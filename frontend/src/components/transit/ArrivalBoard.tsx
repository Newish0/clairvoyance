import React from "react";
import { useNearbyTransits, type NearbyTransit } from "@/hooks/transit/nearby";
import { ScrollArea } from "../ui/scroll-area";

const BoardRow = ({
    stop_id,
    stop_name,
    stop_lat,
    stop_lon,
    route_id,
    route_short_name,
    route_long_name,
}: NearbyTransit) => {
    return (
        <a href={`/routes?route_id=${route_id}`}>
            <div className="m-2 p-4 rounded-xl border bg-card text-card-foreground shadow">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <h3 className="text-xl font-semibold mb-1">{route_short_name}</h3>
                        <p className="text-gray-500 mb-1">{route_long_name}</p>
                    </div>
                    <div className="flex items-center justify-end">
                        <h3 className="text-xl font-semibold mb-2">{9}min</h3>
                    </div>
                </div>
            </div>
        </a>
    );
};

type ArrivalBoardProps = {
    lat: number;
    lng: number;
};

const ArrivalBoard: React.FC<ArrivalBoardProps> = ({ lat, lng }) => {
    const { nearbyRoutes } = useNearbyTransits({ lat, lng, radius: 0.5 });

    return (
        <ScrollArea className="">
            {nearbyRoutes?.map((nbt) => (
                <BoardRow key={nbt.stop_id} {...nbt}></BoardRow>
            ))}
        </ScrollArea>
    );
};

export default ArrivalBoard;
