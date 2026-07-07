import { useState } from "react";
import type { LngLatBounds } from "maplibre-gl";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProtoMap } from "./maps/proto-map";
import { SelectionSquareOverlay } from "./maps/selection-square-overlay";
import { useOfflineAreas } from "@/hooks/use-offline-areas";

const OfflineAreaSelector: React.FC = () => {
    const [bounds, setBounds] = useState<LngLatBounds | null>(null);
    const [name, setName] = useState<string | null>(null);
    const { createArea, updateArea } = useOfflineAreas();
    const [pendingId, setPendingId] = useState<string | null>(null);

    function handleDownload() {
        if (!bounds) return;
        const area = createArea({
            name: name ?? "Unnamed area",
            bounds,
        });
        setPendingId(area.id);

        // TODO: actual tile fetch/persist goes here, then:
        // updateArea(area.id, { state: "downloaded", sizeBytes })
        // or on failure: updateArea(area.id, { state: "error", error: "..." })
    }

    const isDownloading = pendingId !== null;

    return (
        <div className="relative min-h-96 h-full w-full flex flex-col gap-2">
            <ProtoMap>
                <SelectionSquareOverlay
                    marginPx={40}
                    onBbox={(b, n) => {
                        setBounds(b);
                        setName(n);
                    }}
                />
            </ProtoMap>

            <div className="flex items-center justify-center">
                <Button
                    className="pointer-events-auto"
                    size="default"
                    disabled={!bounds || isDownloading}
                    onClick={handleDownload}
                >
                    {isDownloading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="mr-2 h-4 w-4" />
                    )}
                    {isDownloading ? "Downloading…" : `Download ${name ?? "this area"}`}
                </Button>
            </div>
        </div>
    );
};

export default OfflineAreaSelector;
