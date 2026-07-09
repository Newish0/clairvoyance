import { Button } from "@/components/ui/button";
import { useOfflineAreas } from "@/hooks/use-offline-areas";
import { pmtilesProtocol, trpcClient } from "@/main";
import { getDb } from "@/offline/db";
import { saveOfflineData } from "@/offline/manage";
import { planRanges } from "@/offline/pmtiles-plan";
import { IdbSource } from "@/offline/pmtiles-source";
import { addDays, startOfDay } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import type { LngLatBounds } from "maplibre-gl";
import { PMTiles } from "pmtiles";
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

        const start = startOfDay(new Date());
        const end = addDays(start, 2);

        const area = createArea({
            name: selection.name ?? "Unnamed area",
            bounds: selection.bounds,
            dateRange: [start.getTime(), end.getTime()],
        });
        setPendingId(area.id);

        try {
            const data = await trpcClient.offlineSync.getArea.query({
                bounds: area.bbox,
                dateRange: [start, end],
            });

            const db = await getDb();
            await saveOfflineData(db, data);

            // Cache tiles for offline map
            const bboxFlat: [number, number, number, number] = [
                area.bbox[0][0],
                area.bbox[0][1],
                area.bbox[1][0],
                area.bbox[1][1], // w, s, e, n
            ];
            const manifestUrl = `${import.meta.env.BASE_URL}pmtiles/manifest.json`;
            const manifest = await fetch(manifestUrl).then((r) => r.json());
            const centerLon = (area.bbox[0][0] + area.bbox[1][0]) / 2;
            const centerLat = (area.bbox[0][1] + area.bbox[1][1]) / 2;
            const dataset = manifest.datasets.find(
                (d: any) =>
                    centerLon >= d.bbox.minLon &&
                    centerLon <= d.bbox.maxLon &&
                    centerLat >= d.bbox.minLat &&
                    centerLat <= d.bbox.maxLat,
            );
            let tilesUrl: string | undefined;
            // ponytail: world-base too large to cache (45MB+), skip if no dataset matches
            if (dataset) {
                tilesUrl = `${import.meta.env.BASE_URL}${dataset.tiles}`;
                const { ranges } = await planRanges(
                    tilesUrl,
                    bboxFlat,
                    Math.max(10, dataset.minZoom),
                    16,
                );
                pmtilesProtocol.add(new PMTiles(new IdbSource(tilesUrl)));
                const tileBytes = ranges.reduce((s: number, r: any) => s + r.length, 0);
                const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
                updateArea(area.id, {
                    state: "downloaded",
                    sizeBytes: bytes + tileBytes,
                    tilesUrl,
                    tileRanges: ranges.length,
                    tileBytes,
                });
            } else {
                const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
                updateArea(area.id, { state: "downloaded", sizeBytes: bytes });
            }

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
