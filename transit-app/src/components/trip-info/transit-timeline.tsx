import { cn } from "@/lib/utils";
import React, { useEffect, useRef } from "react";

export interface TransitStopProps
    extends Omit<
        TransitStopItemProps,
        "isActive" | "isActiveBullet" | "scrollToView" | "bulletSize" | "lineSize"
    > {
    bulletSize?: number;
}

export interface TransitRouteTimelineProps {
    stops: TransitStopProps[];
    activeStop: number;
    bulletSize?: number;
    lineSize?: number;
}

export const TransitRouteTimeline: React.FC<TransitRouteTimelineProps> = ({
    stops,
    activeStop,
    bulletSize = 16,
    lineSize = 4,
}) => {
    return (
        <ul style={{ paddingLeft: `${bulletSize / 2}px` }}>
            {stops.map((stop, index) => {
                const isActive = activeStop === -1 ? false : activeStop <= index;
                return (
                    <TransitStopItem
                        key={index}
                        stopName={stop.stopName}
                        stopTime={stop.stopTime}
                        description={stop.description}
                        icon={stop.icon}
                        isLast={index === stops.length - 1}
                        isFirst={index === 0}
                        isActive={isActive}
                        isActiveBullet={isActive}
                        scrollToView={index === Math.max(0, activeStop - 1)}
                        bulletSize={index === activeStop ? bulletSize * 1.2 : bulletSize}
                        lineSize={lineSize}
                    />
                );
            })}
        </ul>
    );
};

export interface TransitStopItemProps {
    stopName: React.ReactNode;
    stopTime?: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    isLast?: boolean;
    isFirst?: boolean;
    isActive: boolean;
    isActiveBullet: boolean;
    scrollToView: boolean;
    className?: string;
    bulletSize: number;
    lineSize: number;
}

const TransitStopItem: React.FC<TransitStopItemProps> = ({
    icon,
    description,
    stopName,
    stopTime,
    isLast,
    isFirst,
    isActive,
    isActiveBullet,
    scrollToView,
    bulletSize,
    lineSize,
    className,
    ...rest
}) => {
    const ref = useRef<HTMLLIElement | null>(null);

    useEffect(() => {
        if (scrollToView && ref.current) {
            ref.current.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "center",
            });
        }
    }, [scrollToView]);

    return (
        <li
            ref={ref}
            className={cn(
                "relative border-l pb-8 pl-8",
                isLast && "border-l-transparent pb-0",
                isActive && !isLast && "border-l-primary",
                className
            )}
            style={{ borderLeftWidth: `${lineSize}px` }}
            {...rest}
        >
            <TransitStopBullet
                lineSize={lineSize}
                bulletSize={bulletSize}
                isActive={isActiveBullet}
                isLast={isLast}
                isFirst={isFirst}
            >
                {icon}
            </TransitStopBullet>

            <div
                className={cn(
                    "flex items-center justify-between",
                    !isActive && "text-muted-foreground"
                )}
            >
                <TransitStopName>{stopName}</TransitStopName>
                {stopTime && <TransitStopTime>{stopTime}</TransitStopTime>}
            </div>

            {description && <TransitStopDescription>{description}</TransitStopDescription>}
        </li>
    );
};

export interface TransitStopBulletProps {
    children?: React.ReactNode;
    isActive?: boolean;
    isLast?: boolean;
    isFirst?: boolean;
    bulletSize: number;
    lineSize: number;
}

const TransitStopBullet: React.FC<TransitStopBulletProps> = ({
    children,
    isActive,
    isLast,
    isFirst,
    bulletSize,
    lineSize,
}) => {
    return (
        <div
            className={cn(
                "absolute top-0 flex items-center justify-center rounded-full border bg-background",
                isActive && "border-primary",
                isLast && "bg-primary",
                isFirst && "bg-border"
            )}
            style={{
                width: `${bulletSize}px`,
                height: `${bulletSize}px`,
                left: `${-bulletSize / 2 - lineSize / 2}px`,
                borderWidth: `${lineSize}px`,
            }}
            aria-hidden="true"
        >
            {children}
        </div>
    );
};

const TransitStopName: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex-1 mb-1 text-base font-semibold leading-none">{children}</div>
);

const TransitStopTime: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mx-2 mb-1 text-sm text-muted-foreground">{children}</div>
);

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
