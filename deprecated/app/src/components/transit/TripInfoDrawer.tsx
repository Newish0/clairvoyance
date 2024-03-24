import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { useEffect, useState } from "react";
import { useTrip } from "../hooks/transit";

interface TripInfoDrawerProps {
    info: {
        tripId: string;
        yourLoc: {
            lat: number;
            lng: number;
        };
    };
    isOpen: boolean;
    onClose: () => void;
}

export const TripInfoDrawer = ({ info, isOpen, onClose }: TripInfoDrawerProps) => {
    const handleExit = () => {
        onClose();
    };

    const { data, isLoading } = useTrip(info.tripId);

    const secondsSinceLastUpdate = (Date.now() - new Date(data?.timestamp ?? "").getTime()) / 1000;

    return (
        <Drawer open={isOpen} dismissible>
            <DrawerContent>
                <div className="mx-auto w-full min-h-[50dvh] max-w-sm">
                    {isLoading ? (
                        <></>
                    ) : (
                        <>
                            <DrawerHeader>
                                <DrawerTitle>{data?.route_short_name}</DrawerTitle>
                                <DrawerDescription>
                                    {data?.route_desc || data?.route_long_name}
                                </DrawerDescription>
                            </DrawerHeader>
                            <div className="p-4 pb-0">
                                <div className="text-sm font-medium leading-none">
                                    Position: {data?.latitude} {data?.longitude}
                                </div>

                                <i className="text-sm text-muted-foreground">
                                    Last updated: {Math.round(secondsSinceLastUpdate)} second(s) ago
                                </i>
                            </div>
                        </>
                    )}
                    <DrawerFooter>
                        <DrawerClose asChild>
                            <Button variant="outline" onClick={handleExit}>
                                Exit
                            </Button>
                        </DrawerClose>
                    </DrawerFooter>
                </div>
            </DrawerContent>
        </Drawer>
    );
};
