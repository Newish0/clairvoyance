import { type JSX, Match, Switch, type Component } from "solid-js";
import { render } from "solid-js/web";
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
                        "bg-fuchsia-600/95",
                        "border-white/90"
                    )}
                />
            </Match>
        </Switch>
    );
};

const asHtmlElement = (component: JSX.Element) => {
    const container = document.createElement("div");
    render(() => component, container);
    return container.firstElementChild as HTMLElement;
};

export { LocationMarker, asHtmlElement };
