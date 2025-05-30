import { Match, Switch, type Component } from "solid-js";
import { cn } from "~/lib/utils";

type LocationMarkerProps = {
    type: "blue" | "purple";
};

const LocationMarker: Component<LocationMarkerProps> = ({ type }) => {
    return (
        <Switch>
            <Match when={type === "blue"}>
                <div
                    class={cn("rounded-full w-6 h-6 border-4", "bg-sky-600/95", "border-white/90")}
                />
            </Match>
            <Match when={type === "purple"}>
                <div
                    class={cn(
                        "rounded-full w-6 h-6 border-4",
                        "bg-purple-600/95",
                        "border-white/90"
                    )}
                />
            </Match>
        </Switch>
    );
};

export default LocationMarker;
