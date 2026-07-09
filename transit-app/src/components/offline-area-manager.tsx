import { DatabaseCheck, Trash2, Loader2, AlertTriangle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflineAreas } from "@/hooks/use-offline-areas";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "@/components/ui/responsible-dialog";
import OfflineAreaSelector from "./offline-area-selector";

function formatBytes(bytes?: number) {
    if (!bytes) return null;
    const mb = bytes / 1024 / 1024;
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

export const OfflineAreaManager = () => {
    const { areas, removeArea, createArea, updateArea } = useOfflineAreas();

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
            {areas.map((area) => (
                <li
                    key={area.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <MapPin className="size-4 shrink-0 text-muted-foreground" />
                        <div className="overflow-hidden">
                            <p className="truncate text-sm font-medium">{area.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {formatBytes(area.sizeBytes)}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {area.state === "downloading" && (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        )}
                        {area.state === "error" && (
                            <AlertTriangle
                                className="size-4 text-destructive"
                                aria-label={area.error ?? "Download failed"}
                            />
                        )}
                        {area.state === "downloaded" && (
                            <DatabaseCheck className="size-4 text-primary" />
                        )}
                        <Button size="icon" variant="ghost" onClick={() => removeArea(area.id)}>
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                </li>
            ))}

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
}> = ({ trigger, createArea, updateArea }) => (
    <ResponsiveModal>
        <ResponsiveModalTrigger asChild>{trigger}</ResponsiveModalTrigger>
        <ResponsiveModalContent className="min-w-2/3 max-w-3xl">
            <ResponsiveModalHeader>
                <ResponsiveModalTitle>Select an area</ResponsiveModalTitle>
            </ResponsiveModalHeader>
            <div className="p-4 overflow-auto">
                <OfflineAreaSelector createArea={createArea} updateArea={updateArea} />
            </div>
        </ResponsiveModalContent>
    </ResponsiveModal>
);
