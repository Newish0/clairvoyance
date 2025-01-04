import { type Component } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-solid";

interface TripInfoProps {
    routeShortName: string;
    routeLongName: string;
}

export const TripInfo: Component<TripInfoProps> = (props) => {
    return (
        <div class="flex flex-col space-y-2">
            <Badge variant="secondary" class="text-sm font-bold">
                {props.routeShortName}
            </Badge>
            <h4 class="text-lg font-semibold">{props.routeLongName}</h4>
        </div>
    );
};