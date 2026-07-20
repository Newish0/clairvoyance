import { Progress } from "@/components/ui/progress";
import { getProgressValue, type DownloadProgress } from "@/offline/download";
import { cn } from "@/lib/utils";
import { ProgressCircle } from "./ui/progress-circle";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export type { DownloadProgress } from "@/offline/download";

export function OfflineDownloadProgress({
    progress,
    className,
    variant = "full",
}: {
    progress: DownloadProgress;
    className?: string;
    variant?: "full" | "compact";
}) {
    if (variant === "compact") {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <ProgressCircle
                        value={getProgressValue(progress)}
                        className={className}
                        size={16}
                    />
                </TooltipTrigger>
                <TooltipContent>
                    <p className="text-xs text-muted-foreground">{progress.message}</p>
                </TooltipContent>
            </Tooltip>
        );
    }

    return (
        <div className={cn("flex flex-col gap-1", className)}>
            <p className="text-xs text-muted-foreground flex justify-between">
                <span>{progress.message}</span>
                <span>{getProgressValue(progress).toFixed(0)}%</span>
            </p>
            <Progress className="h-1" value={getProgressValue(progress)} />
        </div>
    );
}
