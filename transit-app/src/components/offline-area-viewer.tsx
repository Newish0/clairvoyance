import { Button } from "@/components/ui/button";
import { AreaBboxLayer } from "./maps/area-bbox-layer";
import { ProtoMap } from "./maps/proto-map";

const OfflineAreaViewer: React.FC<{
    bbox: [[number, number], [number, number]];
    name?: string;
    onComplete?: () => void;
}> = ({ bbox, name, onComplete }) => {
    return (
        <div className="relative h-96 w-full flex flex-col gap-2">
            <ProtoMap>
                <AreaBboxLayer bbox={bbox} />
            </ProtoMap>

            <div className="flex flex-col gap-2">
                <Button
                    className="pointer-events-auto w-full"
                    size="default"
                    variant="secondary"
                    onClick={onComplete}
                >
                    <span className="truncate">Close {name ?? "area"}</span>
                </Button>
            </div>
        </div>
    );
};

export default OfflineAreaViewer;
