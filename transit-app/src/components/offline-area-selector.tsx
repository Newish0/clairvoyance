import { useCallback, useState } from "react";
import type { LngLatBounds } from "maplibre-gl";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProtoMap } from "./maps/proto-map";
import { SelectionSquareOverlay } from "./maps/selection-square-overlay";
import { useOfflineAreas } from "@/hooks/use-offline-areas";
import { trpcClient } from "@/main";
import { addDays, startOfDay } from "date-fns";
import { getDb } from "@/offline/db";
import * as tables from "database/models/tables";
import { upsertMany } from "@/offline/upsert";

type Selection = {
    bounds: LngLatBounds | null;
    name: string | null;
    exceedsLimit: boolean;
};

const OfflineAreaSelector: React.FC<{
    createArea: ReturnType<typeof useOfflineAreas>["createArea"];
    updateArea: ReturnType<typeof useOfflineAreas>["updateArea"];
}> = ({ createArea, updateArea }) => {
    const [selection, setSelection] = useState<Selection | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);

    const handleDownload = async () => {
        if (!selection?.bounds || selection.exceedsLimit) return;
        const area = createArea({
            name: selection.name ?? "Unnamed area",
            bounds: selection.bounds,
        });
        setPendingId(area.id);

        try {
            const data = await trpcClient.offlineSync.getArea.query({
                bounds: area.bbox,
                dateRange: [startOfDay(new Date()), addDays(startOfDay(new Date()), 2)],
            });

            console.log(data);

            const db = await getDb();
            await db.transaction(async (tx) => {
                console.log("Inserting data");
                await upsertMany(
                    tx,
                    tables.tripInstances,
                    data.tripInstances,
                    tables.tripInstances.id,
                );
                await upsertMany(tx, tables.stopTimeStaticInstances, data.stopTimeStaticInstances, [
                    tables.stopTimeStaticInstances.tripInstanceId,
                    tables.stopTimeStaticInstances.stopTimeId,
                ]);
                await upsertMany(tx, tables.stops, data.stops, tables.stops.id);
                await upsertMany(tx, tables.routes, data.routes, tables.routes.id);
                await upsertMany(tx, tables.trips, data.trips, tables.trips.id);
                await upsertMany(tx, tables.shapes, data.shapes, tables.shapes.id);
            });

            const bytes = new TextEncoder().encode(JSON.stringify(data)).length;

            updateArea(area.id, { state: "downloaded", sizeBytes: bytes });
            console.log("Downloaded", bytes, "bytes");
        } catch (e) {
            updateArea(area.id, { state: "error", error: (e as Error).message });
            console.error(e);
        } finally {
            setPendingId(null);
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
