import { createFileRoute } from "@tanstack/react-router";

import { HomeMap } from "@/components/maps/home-map";
import { Button } from "@/components/ui/button";
import { SettingsIcon } from "lucide-react";

export const Route = createFileRoute("/")({
    component: TransitApp,
});

function TransitApp() {
    return (
        <div className="h-[100dvh] w-[100dvw] relative">
            <div className="w-full h-full absolute top-0 left-0">
                <HomeMap />
            </div>

            <div className="relative">
                <Button variant={"secondary"} size={"icon"} className="absolute top-4 right-4">
                    <SettingsIcon />
                </Button>
            </div>
        </div>
    );
}
