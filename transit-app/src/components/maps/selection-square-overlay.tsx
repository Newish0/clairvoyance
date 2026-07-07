import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSelectionBbox } from "@/hooks/map/use-selection-bbox";
import { useEffect } from "react";
import type { LngLatBounds } from "maplibre-gl";
import { useAreaName } from "@/hooks/map/use-area-name";

interface SelectionSquareOverlayProps {
    /** Distance in px from the nearest viewport edge to the square. */
    marginPx?: number;
    onBbox?: (bbox: LngLatBounds | null, areaName: string | null) => void;
}

export const SelectionSquareOverlay = ({ marginPx = 32, onBbox }: SelectionSquareOverlayProps) => {
    const { bounds, squareSizePx, pixelBounds } = useSelectionBbox(marginPx);
    const areaName = useAreaName(bounds, pixelBounds);

    useEffect(() => onBbox?.(bounds, areaName), [bounds, areaName, onBbox]);

    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* dimmed backdrop with a cutout square, via oversized box-shadow */}
            <div
                className="rounded-md border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
                style={{ width: squareSizePx, height: squareSizePx }}
            />
        </div>
    );
};
