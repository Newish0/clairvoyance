import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { secondsToMinutes } from "date-fns";
interface RealTimeIndicatorProps {
    delaySeconds: number;
    className?: string;
}
export const RealTimeIndicator: React.FC<RealTimeIndicatorProps> = ({
    delaySeconds,
    className,
}) => {
    const tooltipContent =
        delaySeconds > 30
            ? `${secondsToMinutes(delaySeconds)} min late`
            : delaySeconds >= -30
              ? "On time"
              : `${secondsToMinutes(delaySeconds)} min early`;

    const statusColor = cn({
        "bg-red-400": delaySeconds > 180,
        "bg-orange-400": delaySeconds > 30 && delaySeconds <= 180,
        "bg-green-400": delaySeconds >= -30 && delaySeconds <= 30,
        "bg-blue-400": delaySeconds < -30,
    });

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {/* TODO: FIx tooltip trigger placement */}
                <div className={cn("absolute top-0 right-0 h-2 w-2", className)}>
                    <div
                        className={cn(
                            "absolute top-0 left-0 h-2 w-2 rounded-full animate-ping pointer-events-auto",
                            statusColor
                        )}
                    />
                    <div
                        className={cn(
                            "absolute top-0 left-0 h-2 w-2 rounded-full pointer-events-auto",
                            statusColor
                        )}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <div className="text-xs text-muted-foreground">{tooltipContent}</div>
            </TooltipContent>
        </Tooltip>
    );
};
