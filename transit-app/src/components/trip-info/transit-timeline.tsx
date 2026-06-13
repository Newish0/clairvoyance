import { cn } from "@/lib/utils";
import { getMutedColor, withOpacity } from "@/utils/css";
import React, { useEffect, useRef } from "react";

export interface TransitStopProps
    extends Omit<
        TransitStopItemProps,
        | "isActive"
        | "isPast"
        | "isCurrent"
        | "scrollToView"
        | "bulletSize"
        | "lineSize"
        | "bulletBorderSize"
        | "color"
        | "fillColor"
    > {
    bulletSize?: number;
}

export interface TransitRouteTimelineProps {
    stops: TransitStopProps[];
    activeStop: number;
    bulletSize?: number;
    /** Thickness of the vertical connecting line */
    lineSize?: number;
    /** Thickness of the bullet border ring */
    bulletBorderSize?: number;
    /** Any valid CSS color, e.g. "#3b82f6" or "rgb(99,102,241)" */
    color?: string;
    fillColor?: string;
}

export const TransitRouteTimeline: React.FC<TransitRouteTimelineProps> = ({
    stops,
    activeStop,
    bulletSize = 16,
    lineSize = 8,
    bulletBorderSize = 2,
    color = "var(--primary)",
    fillColor = "var(--background)",
}) => {
    return (
        <ul style={{ paddingLeft: `${bulletSize / 2 + lineSize / 2}px` }}>
            {stops.map((stop, index) => {
                // the line on a stop connects it *down* to the next, so color
                // it when we've passed through (index < activeStop) or are current
                const isActive = activeStop === -1 ? false : index >= activeStop;
                const isPast = activeStop !== -1 && index < activeStop;
                const isCurrent = index === activeStop;

                return (
                    <TransitStopItem
                        key={index}
                        {...stop}
                        isLast={index === stops.length - 1}
                        isFirst={index === 0}
                        isActive={isActive}
                        isPast={isPast}
                        scrollToView={activeStop >= 0 && index === activeStop}
                        bulletSize={isCurrent ? bulletSize * 1.5 : bulletSize}
                        lineSize={lineSize}
                        bulletBorderSize={isCurrent ? bulletBorderSize * 3 : bulletBorderSize}
                        color={color}
                        fillColor={fillColor}
                    />
                );
            })}
        </ul>
    );
};

export interface TransitStopItemProps {
    stopName: React.ReactNode;
    stopTime?: React.ReactNode;
    stopInfo?: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    isLast?: boolean;
    isFirst?: boolean;
    isActive: boolean;
    isPast: boolean;
    scrollToView: boolean;
    className?: string;
    bulletSize: number;
    lineSize: number;
    bulletBorderSize: number;
    color: string;
    fillColor: string;
}

const TransitStopItem: React.FC<TransitStopItemProps> = ({
    icon,
    description,
    stopName,
    stopTime,
    stopInfo,
    isLast,
    isActive,
    isPast,
    scrollToView,
    bulletSize,
    lineSize,
    bulletBorderSize,
    color,
    fillColor,
    className,
    ...rest
}) => {
    const ref = useRef<HTMLLIElement | null>(null);
    const mutedColor = withOpacity(getMutedColor(color), 0.9);
    const mutedFillColor = withOpacity(getMutedColor(fillColor), 0.9);

    useEffect(() => {
        if (scrollToView && ref.current) {
            ref.current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
    }, [scrollToView]);

    const lineColor = isLast ? "transparent" : isActive ? color : isPast ? mutedColor : undefined;

    return (
        <li
            ref={ref}
            className={cn("relative border-l pb-6 pl-8", isLast && "pb-0", className)}
            style={{ borderLeftWidth: `${lineSize}px`, borderLeftColor: lineColor }}
            {...rest}
        >
            <TransitStopBullet
                bulletSize={bulletSize}
                lineSize={lineSize}
                bulletBorderSize={bulletBorderSize}
                isActive={isActive}
                isPast={isPast}
                isLast={isLast}
                color={color}
                mutedColor={mutedColor}
                fillColor={fillColor}
                mutedFillColor={mutedFillColor}
            >
                {icon}
            </TransitStopBullet>

            <div
                className={cn(
                    "flex items-center justify-between mb-1",
                    !isActive && "text-muted-foreground",
                )}
            >
                <div className="flex-1">
                    <div className="text-base font-semibold leading-none">{stopName}</div>
                    {stopInfo && <div>{stopInfo}</div>}
                </div>
                {stopTime && (
                    <div className="mx-2 mb-1 text-sm text-muted-foreground">{stopTime}</div>
                )}
            </div>

            {description && <TransitStopDescription>{description}</TransitStopDescription>}
        </li>
    );
};

export interface TransitStopBulletProps {
    children?: React.ReactNode;
    isActive?: boolean;
    isPast?: boolean;
    isLast?: boolean;
    bulletSize: number;
    lineSize: number;
    bulletBorderSize: number;
    color: string;
    mutedColor: string;
    fillColor: string;
    mutedFillColor: string;
}

const TransitStopBullet: React.FC<TransitStopBulletProps> = ({
    children,
    isActive,
    isPast,
    isLast,
    bulletSize,
    lineSize,
    bulletBorderSize,
    color,
    mutedColor,
    fillColor,
    mutedFillColor,
}) => {
    const borderColor = isActive ? color : isPast ? mutedColor : undefined;
    const bgColor = isActive ? fillColor : isPast ? mutedFillColor : undefined;

    return (
        <div
            className="absolute top-0 flex items-center justify-center rounded-full"
            style={{
                width: `${bulletSize}px`,
                height: `${bulletSize}px`,
                left: `${-(bulletSize / 2 + lineSize / 2)}px`,
                borderWidth: `${bulletBorderSize}px`,
                borderStyle: "solid",
                borderColor,
                backgroundColor: isLast && isActive ? color : bgColor,
            }}
            aria-hidden="true"
        >
            {children}
        </div>
    );
};

const TransitStopDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
    className,
    children,
    ...rest
}) => (
    <p className={cn("text-sm text-muted-foreground", className)} {...rest}>
        {children}
    </p>
);

export default TransitRouteTimeline;
