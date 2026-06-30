import { useGeolocation } from "@/components/geolocation-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Locate } from "lucide-react";
import { useMap } from "react-map-gl/maplibre";

/**
 * Centers the map to the user's geolocation.
 * Shows different icons based on permission/loading state.
 */
export const GeolocateMapControl: React.FC = () => {
    const { current: map } = useMap();
    const { position, error } = useGeolocation();

    const handleLocateAndFly = () => {
        if (position) {
            map?.flyTo({
                center: [position.coords.longitude, position.coords.latitude],
                zoom: Math.max(map.getZoom(), 16),
                duration: 800,
            });
        }
    };

    if (!position || error) {
        return null;
    }

    return (
        <Button
            variant="secondary"
            size="icon"
            className={cn(
                "pointer-events-auto shadow-md size-9",
                position && !error && "text-primary",
            )}
            onClick={handleLocateAndFly}
            title={error ? "Location unavailable" : "Center to my location"}
            aria-label="Center to my location"
        >
            <Locate size={16} />
        </Button>
    );
};
