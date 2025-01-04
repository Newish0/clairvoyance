import { type Component } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-solid";
import type { StopInfoProps } from "~/types";

const StopInfo: Component<StopInfoProps> = (props) => {
    const { stopName, arrivalTime } = props;

    return (
        <div class="flex items-center justify-between p-4 border-b">
            <div class="flex-1">
                <h4 class="text-lg font-semibold">{stopName}</h4>
                <div class="flex items-center space-x-1">
                    <Clock class="h-4 w-4 text-muted-foreground" />
                    <span class="text-sm">{arrivalTime}</span>
                </div>
            </div>
            <Badge variant="secondary">Next Stop</Badge>
        </div>
    );
};

export default StopInfo;