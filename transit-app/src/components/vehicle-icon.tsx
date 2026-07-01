import type { RouteType } from "database/models/enums";
import {
    mdiBus,
    mdiBusElectric,
    mdiFerry,
    mdiGondola,
    mdiSubway,
    mdiTrain,
    mdiTrainCar,
    mdiTram,
} from "@mdi/js";
import Icon from "@mdi/react";

const VEHICLE_ICON_MAP: Record<RouteType, string> = {
    BUS: mdiBus,
    TRAM: mdiTram,
    FERRY: mdiFerry,
    CABLE_TRAM: mdiTram,
    SUBWAY: mdiSubway,
    AERIAL_LIFT: mdiGondola,
    FUNICULAR: mdiTrainCar,
    TROLLEYBUS: mdiBusElectric,
    MONORAIL: mdiTrain,
    RAIL: mdiTrain,
};

type VehicleIconProps = {
    routeType: RouteType;
} & Omit<React.ComponentProps<typeof Icon>, "path">;

const VehicleIcon: React.FC<VehicleIconProps> = ({ routeType, ...rest }) => {
    return <Icon path={VEHICLE_ICON_MAP[routeType]} {...rest} />;
};

export default VehicleIcon;
