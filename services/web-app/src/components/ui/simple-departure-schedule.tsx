import { createEffect, createSignal, For, type Component } from "solid-js";
import { cn } from "~/lib/utils";
import { Card, CardContent } from "./card";
import { WifiHighIcon } from "lucide-solid";

export type DepartureItem = {
    id: string;
    time: string;
    headsign: string;
    isRealtime?: boolean;
    href?: string;
};

export interface SimpleDepartureScheduleProps {
    scheduleData?: DepartureItem[][];
    onItemSelect?: (item: DepartureItem) => void;
    defaultSelected?: Pick<DepartureItem, "id"> & { [key: string]: string };
}

const SimpleDepartureSchedule: Component<SimpleDepartureScheduleProps> = (props) => {
    const [selectedItem, setSelectedItem] = createSignal<Pick<DepartureItem, "id"> | undefined>(
        props.defaultSelected
    );

    return (
        <div class="space-y-2">
            <For each={props.scheduleData}>
                {(group) => (
                    <Card class="overflow-hidden shadow-sm">
                        <CardContent class="p-0">
                            <div>
                                <For each={group}>
                                    {(item) => (
                                        <a
                                            class={cn(
                                                "flex items-center py-1.5 px-3 transition-colors hover:bg-muted/50 cursor-pointer border-b last:border-b-0 border-muted",
                                                selectedItem().id === item.id && "bg-muted"
                                            )}
                                            onClick={() => {
                                                setSelectedItem(item);
                                                props.onItemSelect?.(item);
                                            }}
                                            href={item.href}
                                        >
                                            <div class="font-medium flex items-center">
                                                <span class="flex-1 w-min whitespace-nowrap">
                                                    {item.time}
                                                </span>
                                                <span class="h-6 w-6 rotate-45">
                                                    <WifiHighIcon size={16} class="animate-pulse" />
                                                </span>
                                            </div>
                                            <div class="text-sm">{item.headsign}</div>
                                        </a>
                                    )}
                                </For>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </For>
        </div>
    );
};

export default SimpleDepartureSchedule;
