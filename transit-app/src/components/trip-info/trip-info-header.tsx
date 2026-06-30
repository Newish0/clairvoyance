import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ensureHexColorStartsWithHash } from "@/utils/css";
import { Link } from "@tanstack/react-router";
import type { Direction } from "database/models/enums";
import { X, ArrowLeftRight } from "lucide-react";

export type TripInfoHeaderProps = {
    routeShortName?: string | null;
    headsign?: string | null;
    stopName?: string | null;
    routeColor?: string | null;
    routeTextColor?: string | null;
    onClose: () => void;
    oppositeTripSearchParams?: {
        agencyId: string;
        stopId: number;
        routeId: number;
        direction: Direction;
        oppositeStopId: number;
    };
};

export function TripInfoHeader({
    routeShortName,
    headsign,
    stopName,
    routeColor,
    routeTextColor,
    onClose,
    oppositeTripSearchParams,
}: TripInfoHeaderProps) {
    return (
        <div className="flex justify-between">
            <div className="flex items-center space-x-2 w-full overflow-hidden">
                <Badge
                    variant="secondary"
                    className="text-sm font-bold"
                    style={{
                        backgroundColor: ensureHexColorStartsWithHash(routeColor),
                        color: ensureHexColorStartsWithHash(routeTextColor),
                    }}
                >
                    {routeShortName || "---"}
                </Badge>

                <div className="overflow-hidden">
                    <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{headsign || "---"}</p>
                        {oppositeTripSearchParams && (
                            <Link
                                to="/nt"
                                search={oppositeTripSearchParams}
                                replace
                                className={buttonVariants({
                                    variant: "outline",
                                    size: "icon-sm",
                                    className: "h-6",
                                })}
                            >
                                <ArrowLeftRight className="size-3" />
                            </Link>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">At {stopName || "---"}</p>
                </div>
            </div>
            <div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X />
                </Button>
            </div>
        </div>
    );
}
