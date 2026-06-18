import { cn } from "@/lib/utils";
import { type PropsWithChildren } from "react";
import { createPortal } from "react-dom";

const POSITION_CLASSES = {
    "top-left": "top-4 left-4 flex-col items-start",
    "top-right": "top-4 right-4 flex-col items-end",
    "bottom-left": "bottom-4 left-4 flex-col-reverse items-start",
    "bottom-right": "bottom-4 right-4 flex-col-reverse items-end",
} as const;

export type MapSideControlsProps = PropsWithChildren<{
    position?: keyof typeof POSITION_CLASSES;
    className?: string;
}>;

export const MapSideControls = ({
    position = "top-right",
    className,
    children,
}: MapSideControlsProps) => {
    return createPortal(
        <div
            className={cn(
                "fixed z-50 flex gap-2 pointer-events-none",
                POSITION_CLASSES[position],
                className,
            )}
        >
            <div className="flex flex-col gap-2 pointer-events-auto">{children}</div>
        </div>,
        document.body,
    );
};
