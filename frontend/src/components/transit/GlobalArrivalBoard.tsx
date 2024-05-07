import ArrivalBoard from "./ArrivalBoard";
import { useStore } from "@nanostores/react";
import { $globalLocation } from "@/stores/globallocation";

const GlobalArrivalBoard: React.FC = () => {
    const { lat, lng, radius } = useStore($globalLocation);
    return <ArrivalBoard lat={lat} lng={lng} radius={radius} />;
};

export default GlobalArrivalBoard;
