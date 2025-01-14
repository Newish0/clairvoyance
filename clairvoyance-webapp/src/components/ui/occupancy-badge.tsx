import { type Component, Switch, Match, For, type ComponentProps } from "solid-js";
import { UserRound, HelpCircle } from "lucide-solid";
import type { OccupancyStatus } from "~/services/gtfs/types";
import { cn } from "~/lib/utils";
import { Badge } from "./badge";

interface OccupancyBadgeProps {
    status: OccupancyStatus;
    size: number;
    variant?: ComponentProps<typeof Badge>["variant"];
}

const OccupancyBadge: Component<OccupancyBadgeProps> = (props) => {
    const getOccupancyInfo = (status: OccupancyStatus) => {
        switch (status) {
            case "EMPTY":
            case "MANY_SEATS_AVAILABLE":
                return { icons: 1, text: "Many seats" };
            case "FEW_SEATS_AVAILABLE":
                return { icons: 2, text: "Few seats" };
            case "STANDING_ROOM_ONLY":
            case "CRUSHED_STANDING_ROOM_ONLY":
            case "FULL":
                return { icons: 3, text: "Standing room" };
            case "NOT_ACCEPTING_PASSENGERS":
                return { icons: 0, text: "Not accepting" };
            default:
                return { icons: -1, text: "No data" };
        }
    };

    const occupancyInfo = () => getOccupancyInfo(props.status);

    return (
        <Badge
            variant={props.variant ?? "secondary"}
            class="flex flex-col items-center justify-center w-min px-1"
        >
            <div class="flex">
                <Switch>
                    <Match when={occupancyInfo().icons >= 0}>
                        <For each={Array(occupancyInfo().icons).fill(0)}>
                            {(_, index) => (
                                <UserRound
                                    size={props.size}
                                    class={cn(
                                        props.variant && props.variant === "secondary"
                                            ? "text-muted-foreground"
                                            : "",
                                        props.variant && props.variant === "default"
                                            ? "text-primary-foreground"
                                            : ""
                                    )}
                                    strokeWidth={props.size / 2}
                                />
                            )}
                        </For>
                    </Match>
                    <Match when={occupancyInfo().icons === -1}>
                        <HelpCircle
                            size={props.size}
                            class={cn(
                                props.variant && props.variant === "secondary"
                                    ? "text-muted-foreground"
                                    : "",
                                props.variant && props.variant === "default"
                                    ? "text-primary-foreground"
                                    : ""
                            )}
                        />
                    </Match>
                </Switch>
            </div>
            {/* <span class="text-muted-foreground font-semibold text-xs text-center">{occupancyInfo().text}</span> */}
        </Badge>
    );
};

export default OccupancyBadge;
