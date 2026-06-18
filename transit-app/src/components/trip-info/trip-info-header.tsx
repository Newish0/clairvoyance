import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ensureHexColorStartsWithHash } from "@/utils/css";
import { X } from "lucide-react";

export type TripInfoHeaderProps = {
    routeShortName?: string | null;
    headsign?: string | null;
    stopName?: string | null;
    routeColor?: string | null;
    routeTextColor?: string | null;
    onClose: () => void;
};

export function TripInfoHeader({
    routeShortName,
    headsign,
    stopName,
    routeColor,
    routeTextColor,
    onClose,
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
                    <p className="font-semibold truncate">{headsign || "---"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                        At {stopName || "---"}
                    </p>
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
