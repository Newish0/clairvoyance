import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { secondsToMinutes } from "date-fns";
interface RealTimeIndicatorProps {
    delaySeconds: number;
}

const RealTimeIndicator: React.FC<RealTimeIndicatorProps> = ({ delaySeconds }) => {
    const getStatusColor = () => {
        if (delaySeconds > 180) return "bg-error-foreground";
        if (delaySeconds > 30) return "bg-warning-foreground";
        if (delaySeconds >= -30 && delaySeconds <= 30) return "bg-success-foreground";
        return "bg-info-foreground";
    };

    const getTooltipContent = () => {
        if (delaySeconds > 30) {
            return (
                <div className="text-xs text-muted-foreground">
                    {secondsToMinutes(delaySeconds)} min late
                </div>
            );
        }
        if (delaySeconds >= -30 && delaySeconds <= 30) {
            return <div className="text-xs text-muted-foreground">On time</div>;
        }
        return (
            <div className="text-xs text-muted-foreground">
                {secondsToMinutes(delaySeconds)} min early
            </div>
        );
    };

    const statusColor = getStatusColor();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div>
                    <div
                        className={cn(
                            "absolute top-0 right-1 h-2 w-2 mt-1 rounded-full animate-ping",
                            statusColor
                        )}
                    />
                    <div
                        className={cn(
                            "absolute top-0 right-1 h-2 w-2 mt-1 rounded-full",
                            statusColor
                        )}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent>{getTooltipContent()}</TooltipContent>
        </Tooltip>
    );
};

export default RealTimeIndicator;
