import type { ComponentProps, ParentComponent } from "solid-js";
import {
    For,
    mergeProps,
    onMount,
    Show,
    splitProps,
    type Component,
    type JSXElement,
} from "solid-js";

import { cn } from "~/lib/utils";

export type TransitStopProps = Omit<
    TransitStopItemProps,
    "isActive" | "isActiveBullet" | "scrollToView" | "bulletSize" | "lineSize"
> & {
    bulletSize?: number;
};

export type TransitRouteTimelineProps = {
    stops: TransitStopProps[];
    activeStop: number;
    bulletSize?: number;
    lineSize?: number;
};

const TransitRouteTimeline: Component<TransitRouteTimelineProps> = (rawProps) => {
    const props = mergeProps({ bulletSize: 12, lineSize: 2 }, rawProps);

    return (
        <ul
            style={{
                "padding-left": `${props.bulletSize / 2}px`,
            }}
        >
            <For each={props.stops}>
                {(stop, index) => {
                    const isActive = () =>
                        props.activeStop === -1 ? false : props.activeStop <= index();
                    return (
                        <TransitStopItem
                            stopName={stop.stopName}
                            stopTime={stop.stopTime}
                            description={stop.description}
                            icon={stop.icon}
                            isLast={index() === props.stops.length - 1}
                            isFirst={index() === 0}
                            isActive={isActive()}
                            isActiveBullet={isActive()}
                            scrollToView={index() === Math.max(0, props.activeStop - 1)}
                            bulletSize={
                                index() === props.activeStop
                                    ? props.bulletSize * 1.2
                                    : props.bulletSize
                            }
                            lineSize={props.lineSize}
                        />
                    );
                }}
            </For>
        </ul>
    );
};

export type TransitStopItemProps = {
    stopName: JSXElement;
    stopTime?: JSXElement;
    description?: JSXElement;
    icon?: JSXElement;
    isLast?: boolean;
    isFirst?: boolean;
    isActive: boolean;
    isActiveBullet: boolean;
    scrollToView: boolean;
    class?: string;
    bulletSize: number;
    lineSize: number;
};

const TransitStopItem: Component<TransitStopItemProps> = (props) => {
    const [local, others] = splitProps(props, [
        "class",
        "icon",
        "description",
        "stopName",
        "stopTime",
        "isLast",
        "isFirst",
        "isActive",
        "isActiveBullet",
        "scrollToView",
        "bulletSize",
        "lineSize",
    ]);

    let ref: HTMLLIElement | null = null;

    onMount(() => {
        if (local.scrollToView && ref !== null) {
            ref.scrollIntoView({
                behavior: "smooth",
                block: "start",
                inline: "center",
            });
        }
    });

    return (
        <li
            ref={(eln) => (ref = eln)}
            class={cn(
                "relative border-l pb-8 pl-8",
                local.isLast && "border-l-transparent pb-0",
                local.isActive && !local.isLast && "border-l-primary",
                local.class
            )}
            style={{
                "border-left-width": `${local.lineSize}px`,
            }}
            {...others}
        >
            <TransitStopBullet
                lineSize={local.lineSize}
                bulletSize={local.bulletSize}
                isActive={local.isActiveBullet}
                isLast={local.isLast}
                isFirst={local.isFirst}
            >
                {local.icon}
            </TransitStopBullet>
            <div
                class={cn(
                    "flex items-center justify-between",
                    !local.isActive && "text-muted-foreground"
                )}
            >
                <TransitStopName>{local.stopName}</TransitStopName>
                <Show when={local.stopTime}>
                    <TransitStopTime>{local.stopTime}</TransitStopTime>
                </Show>
            </div>
            <Show when={local.description}>
                <TransitStopDescription>{local.description}</TransitStopDescription>
            </Show>
        </li>
    );
};

export type TransitStopBulletProps = {
    children?: JSXElement;
    isActive?: boolean;
    isLast?: boolean;
    isFirst?: boolean;
    bulletSize: number;
    lineSize: number;
};

const TransitStopBullet: Component<TransitStopBulletProps> = (props) => {
    return (
        <div
            class={cn(
                `absolute top-0 flex items-center justify-center rounded-full border bg-background`,
                props.isActive && "border-primary",
                props.isLast && "bg-primary",
                props.isFirst && "bg-border"
            )}
            style={{
                width: `${props.bulletSize}px`,
                height: `${props.bulletSize}px`,
                left: `${-props.bulletSize / 2 - props.lineSize / 2}px`,
                "border-width": `${props.lineSize}px`,
            }}
            aria-hidden="true"
        >
            {props.children}
        </div>
    );
};

const TransitStopName: ParentComponent = (props) => {
    return <div class="mb-1 text-base font-semibold leading-none">{props.children}</div>;
};

const TransitStopTime: ParentComponent = (props) => {
    return <div class="mb-1 text-sm text-muted-foreground">{props.children}</div>;
};

const TransitStopDescription: Component<ComponentProps<"p">> = (props) => {
    const [local, others] = splitProps(props, ["class", "children"]);
    return (
        <p class={cn("text-sm text-muted-foreground", local.class)} {...others}>
            {local.children}
        </p>
    );
};

export { TransitRouteTimeline };
