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

    return (
        <Drawer open={isOpen} dismissible>
            <DrawerContent>
                <div className="mx-auto w-full min-h-[50dvh] max-w-sm">
                    {isLoading ? (
                        <></>
                    ) : (
                        <>
                            <DrawerHeader>
                                <DrawerTitle>{data?.trip_short_name}</DrawerTitle>
                                <DrawerDescription>{JSON.stringify(data)}</DrawerDescription>
                            </DrawerHeader>
                            <div className="p-4 pb-0"></div>
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
