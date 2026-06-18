import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "transit-api";

export type TripMapStopInfo = {
    stopId: number;
    sequence: number;
    effectiveTime: Date | null;
    name: string;
    lng: number;
    lat: number;
    shapeDistTraveled: number | null;
    isTarget?: boolean;
    alerts?: inferProcedureOutput<AppRouter["alert"]["getAlertForTripInstance"]>;
};
