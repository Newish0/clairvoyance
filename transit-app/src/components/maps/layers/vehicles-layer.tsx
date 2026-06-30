import { trpcOptions } from "@/main";
import { useSubscription } from "@trpc/tanstack-react-query";
import type { Direction } from "database/models/enums";
import { useState } from "react";
import type { VehiclePosition } from "../../trip-info/vehicle-position-details";
import { VehiclePositionMapMarker } from "../markers/vehicle-map-marker";

export type VehiclesLayerProps = {
    routeId: number;
    routeColor?: string;
    routeTextColor?: string;
    direction?: Direction;
    targetStopSequence?: number;
};

export const VehiclesLayer: React.FC<VehiclesLayerProps> = ({
    routeId,
    direction,
    routeColor,
    routeTextColor,
    targetStopSequence,
}) => {
    const [positions, setPositions] = useState<VehiclePosition[]>([]);
    useSubscription(
        trpcOptions.tripInstance.livePositions.subscriptionOptions(
            {
                routeId,
                direction,
            },
            {
                onData: (data) => {
                    setPositions(data);
                },
                onError: (error) => {
                    console.error("onError", error);
                },
                onStarted: () => {
                    console.log("onStarted");
                },
                onConnectionStateChange: (state) => {
                    console.log("onConnectionStateChange", state);
                },
            },
        ),
    );

    return (
        <>
            {Object.entries(positions).map(([, position]) =>
                position ? (
                    <VehiclePositionMapMarker
                        key={position.tripInstanceId}
                        vehiclePosition={position}
                        longitude={position.location.x}
                        latitude={position.location.y}
                        routeColor={routeColor}
                        routeTextColor={routeTextColor}
                        targetStopSequence={targetStopSequence}
                    />
                ) : null,
            )}
        </>
    );
};
