import { createSignal, Match, Show, Switch, type Component } from "solid-js";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface RealTimeIndicatorProps {
    delay: number;
}

const RealTimeIndicator: Component<RealTimeIndicatorProps> = (props) => {
    return (
        <>
            <Tooltip>
                <TooltipTrigger as="div">
                    <div
                        class={cn(
                            `absolute top-0 right-1 h-2 w-2 mt-1 rounded-full animate-ping`,
                            props.delay < -30 && "bg-info-foreground",
                            props.delay >= -30 && props.delay <= 30 && "bg-success-foreground",
                            props.delay > 30 && "bg-warning-foreground",
                            props.delay > 180 && "bg-error-foreground"
                        )}
                    />
                    <div
                        class={cn(
                            `absolute top-0 right-1 h-2 w-2 mt-1 rounded-full`,
                            props.delay < -30 && "bg-info-foreground",
                            props.delay >= -30 && props.delay <= 30 && "bg-success-foreground",
                            props.delay > 30 && "bg-warning-foreground",
                            props.delay > 180 && "bg-error-foreground"
                        )}
                    />
                </TooltipTrigger>
                <TooltipContent>
                    <Switch>
                        <Match when={props.delay > 30}>
                            <div class="text-xs text-muted-foreground">
                                {(props.delay / 60).toFixed(1)} min delay
                            </div>
                        </Match>
                        <Match when={props.delay <= 30 && props.delay >= -30}>
                            <div class="text-xs text-muted-foreground">On time</div>
                        </Match>
                        <Match when={props.delay < -30}>
                            <div class="text-xs text-muted-foreground">
                                {(Math.abs(props.delay) / 60).toFixed(1)} min early
                            </div>
                        </Match>
                    </Switch>
                </TooltipContent>
            </Tooltip>
        </>
    );
};

export default RealTimeIndicator;
