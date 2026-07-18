import { Button } from "@/components/ui/button";
import { useOfflineAreas } from "@/hooks/use-offline-areas";
import { executeAreaDownload } from "@/offline/download";
import { Download, Loader2 } from "lucide-react";
import type { LngLatBounds } from "maplibre-gl";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ProtoMap } from "./maps/proto-map";
import { SelectionSquareOverlay } from "./maps/selection-square-overlay";

type Selection = {
    bounds: LngLatBounds | null;
    name: string | null;
    exceedsLimit: boolean;
};

const OfflineAreaSelector: React.FC<{
    createArea: ReturnType<typeof useOfflineAreas>["createArea"];
    updateArea: ReturnType<typeof useOfflineAreas>["updateArea"];
    onComplete?: () => void;
}> = ({ createArea, updateArea, onComplete }) => {
    const [selection, setSelection] = useState<Selection | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);

    const handleDownload = async () => {
        if (!selection?.bounds || selection.exceedsLimit) return;

        const area = createArea({
            name: selection.name ?? "Unnamed area",
            bounds: selection.bounds,
            dateRange: [Date.now(), Date.now()], // placeholder, executeAreaDownload uses its own default
        });
        setPendingId(area.id);

        try {
            const result = await executeAreaDownload(area.bbox);
            updateArea(area.id, { state: "downloaded", ...result });
            toast.success(`Downloaded offline area "${area.name}"`);
        } catch (e) {
            updateArea(area.id, { state: "error", error: (e as Error).message });
            toast.error((e as Error).message);
        } finally {
            setPendingId(null);
            onComplete?.();
        }
    };

    const handleBbox = useCallback(
        (bounds: LngLatBounds | null, name: string | null, exceedsLimit: boolean) => {
            setSelection({ bounds, name, exceedsLimit });
        },
        [],
    );

    const isDownloading = pendingId !== null;

    return (
        <div className="relative h-96 w-full flex flex-col gap-2">
            <ProtoMap>
                <SelectionSquareOverlay marginPx={40} onBbox={handleBbox} />
            </ProtoMap>

            <div className="flex items-center justify-center">
                <Button
                    className="pointer-events-auto w-full"
                    size="default"
                    disabled={!selection?.bounds || selection.exceedsLimit || isDownloading}
                    onClick={handleDownload}
                >
                    {isDownloading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="mr-2 h-4 w-4" />
                    )}
                    <span className="truncate">
                        {isDownloading
                            ? "Downloading…"
                            : `Download ${selection?.name ?? "this area"}`}
                    </span>
                </Button>
            </div>
        </div>
    );
};

export default OfflineAreaSelector;
