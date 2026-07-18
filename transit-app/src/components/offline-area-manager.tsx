import { Button } from "@/components/ui/button";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "@/components/ui/responsible-dialog";
import { useOfflineAreas, type OfflineArea } from "@/hooks/use-offline-areas";
import { getDb } from "@/offline/db";
import { executeAreaDownload } from "@/offline/download";
import { pruneOfflineData } from "@/offline/manage";
import { AlertTriangle, Loader2, MapPin, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import OfflineAreaSelector from "./offline-area-selector";
import { formatDate } from "date-fns";

function formatBytes(bytes?: number) {
    if (!bytes) return null;
    const mb = bytes / 1024 / 1024;
    const useGB = mb >= 1024;
    return new Intl.NumberFormat(undefined, {
        style: "unit",
        unit: useGB ? "gigabyte" : "megabyte",
        unitDisplay: "short",
        maximumFractionDigits: useGB ? 1 : 0,
    }).format(useGB ? mb / 1024 : mb);
}

export const OfflineAreaManager = () => {
    const { areas, removeArea, createArea, updateArea } = useOfflineAreas();

    const handleRemoveOfflineArea = async (id: string) => {
        const area = areas.find((a) => a.id === id);
        if (!area) return;

        if (area.state === "downloading") {
            toast.error("Cannot remove an area that is currently being downloaded.");
            return;
        }

        updateArea(id, { state: "deleting" });

        const areasToKeep = areas.filter((a) => a.id !== id);
        const db = await getDb();
        await pruneOfflineData(db, areasToKeep);

        removeArea(id);
    };

    const handleUpdateArea = async (area: OfflineArea) => {
        if (area.state === "downloading") return;

        updateArea(area.id, { state: "downloading" });

        try {
            const result = await executeAreaDownload(area.bbox);
            updateArea(area.id, { state: "downloaded", ...result });

            // Prune data no longer covered by any area's date range
            const db = await getDb();
            const updatedAreas = areas.map((a) =>
                a.id === area.id ? { ...a, ...result, state: "downloaded" as const } : a,
            );
            await pruneOfflineData(db, updatedAreas);

            toast.success(`Updated offline area "${area.name}"`);
        } catch (e) {
            updateArea(area.id, { state: "error", error: (e as Error).message });
            toast.error((e as Error).message);
        }
    };

    if (areas.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No offline areas downloaded yet.
                <AreaSelectorModal
                    createArea={createArea}
                    updateArea={updateArea}
                    trigger={
                        <Button variant="link" size="sm">
                            Select an area
                        </Button>
                    }
                />
            </p>
        );
    }

    return (
        <ul className="flex flex-col gap-2">
            {areas.map((area) => {
                const isLoading = area.state === "downloading" || area.state === "deleting";
                const isOutdated = !isLoading && area.dateRange[1] < Date.now();

                return (
                    <li
                        key={area.id}
                        className="flex items-center justify-between gap-3 rounded-md border p-3"
                    >
                        <div className="flex items-center gap-2 overflow-hidden">
                            <MapPin className="size-4 shrink-0 text-muted-foreground" />
                            <div className="overflow-hidden">
                                <p className="truncate text-sm font-medium">{area.name}</p>
                                <div className="flex items-center gap-x-2 flex-wrap">
                                    {area.sizeBytes !== undefined && (
                                        <p className="text-xs text-muted-foreground">
                                            {formatBytes(area.sizeBytes)}
                                        </p>
                                    )}
                                    {isOutdated ? (
                                        <p className="text-xs text-destructive-foreground">
                                            Outdated since {formatDate(area.dateRange[1], "PPp")}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Expires on {formatDate(area.dateRange[1], "PPp")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {isLoading && (
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            )}
                            {area.state === "error" && (
                                <AlertTriangle
                                    className="size-4 text-destructive"
                                    aria-label={area.error ?? "Download failed"}
                                />
                            )}

                            {area.state === "downloaded" && (
                                <Button
                                    disabled={isLoading}
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleUpdateArea(area)}
                                >
                                    <RefreshCw className="size-4" />
                                </Button>
                            )}

                            <Button
                                disabled={isLoading}
                                size="icon"
                                variant="ghost"
                                onClick={() => handleRemoveOfflineArea(area.id)}
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        </div>
                    </li>
                );
            })}

            <AreaSelectorModal
                createArea={createArea}
                updateArea={updateArea}
                trigger={
                    <Button variant="link" size="sm">
                        Add an area
                    </Button>
                }
            />
        </ul>
    );
};

const AreaSelectorModal: React.FC<{
    trigger: React.ReactNode;
    createArea: ReturnType<typeof useOfflineAreas>["createArea"];
    updateArea: ReturnType<typeof useOfflineAreas>["updateArea"];
}> = ({ trigger, createArea, updateArea }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <ResponsiveModal open={isOpen} onOpenChange={setIsOpen}>
            <ResponsiveModalTrigger asChild>{trigger}</ResponsiveModalTrigger>
            <ResponsiveModalContent className="min-w-2/3 max-w-3xl">
                <ResponsiveModalHeader>
                    <ResponsiveModalTitle>Select an area</ResponsiveModalTitle>
                </ResponsiveModalHeader>
                <div className="p-4 overflow-auto">
                    <OfflineAreaSelector
                        createArea={createArea}
                        updateArea={updateArea}
                        onComplete={() => setIsOpen(false)}
                    />
                </div>
            </ResponsiveModalContent>
        </ResponsiveModal>
    );
};
