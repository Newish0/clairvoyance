import { UserRound } from "lucide-solid";
import { type Component, type ComponentProps, For, Show } from "solid-js";
import { cn } from "~/lib/utils";
import { Badge } from "./badge";
import { OccupancyStatus } from "gtfs-db-types";

interface OccupancyBadgeProps {
    status: number;
    size: number;
    variant?: ComponentProps<typeof Badge>["variant"];
}

const OccupancyBadge: Component<OccupancyBadgeProps> = (props) => {
    const getOccupancyInfo = (status: OccupancyStatus) => {
        switch (status) {
            case OccupancyStatus.EMPTY:
            case OccupancyStatus.MANY_SEATS_AVAILABLE:
                return { icons: 1, text: "Many seats" };
            case OccupancyStatus.FEW_SEATS_AVAILABLE:
                return { icons: 2, text: "Few seats" };
            case OccupancyStatus.STANDING_ROOM_ONLY:
            case OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY:
            case OccupancyStatus.FULL:
                return { icons: 3, text: "Standing room" };
            case OccupancyStatus.NOT_ACCEPTING_PASSENGERS:
                return { icons: 0, text: "Not accepting" };
            default:
                return { icons: -1, text: "No data" };
        }
    };

    const occupancyInfo = () => getOccupancyInfo(props.status);

    return (
        <Show when={occupancyInfo().icons >= 0}>
            <Badge
                variant={props.variant ?? "secondary"}
                class="flex flex-col items-center justify-center w-min px-1"
            >
                <div class="flex">
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
                                // strokeWidth={props.size / 3}
                            />
                        )}
                    </For>
                </div>
                {/* <span class="text-muted-foreground font-semibold text-xs text-center">{occupancyInfo().text}</span> */}
            </Badge>
        </Show>
    );
};

export default OccupancyBadge;
