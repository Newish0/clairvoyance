import type {
    AlertCause,
    AlertEffect,
    AlertSeverity,
    CongestionLevel,
    Direction,
    OccupancyStatus,
    PickupDropOff,
    RouteType,
    StopTimeUpdateScheduleRelationship,
    TripInstanceState,
    VehicleStopStatus,
    Accessability,
} from "database/models/enums";
import type { EntitySelector, TimePeriod, TranslationMap } from "database/models/types";
import { createHash } from "node:crypto";
import type {
    TranslatedString
} from "../gen/proto/gtfs-realtime_pb";
import {
    Alert_Cause,
    Alert_Effect,
    Alert_SeverityLevel,
    TripDescriptor_ScheduleRelationship,
    TripUpdate_StopTimeUpdate_ScheduleRelationship,
    TripUpdate_StopTimeUpdate_StopTimeProperties_DropOffPickupType,
    VehicleDescriptor_WheelchairAccessible,
    VehiclePosition_CongestionLevel,
    VehiclePosition_OccupancyStatus,
    VehiclePosition_VehicleStopStatus,
} from "../gen/proto/gtfs-realtime_pb";

// =========================================================
// Core helpers
// =========================================================

/** Strip GTFS trip_id suffixes like `#...` added by some GTFS-RT providers */
export function extractCoreTripSid(tripSid: string): string {
    const idx = tripSid.indexOf("#");
    return idx === -1 ? tripSid : tripSid.substring(0, idx);
}

function toNumber(v: bigint | number | null | undefined): number | null {
    if (v == null) return null;
    return typeof v === "bigint" ? Number(v) : v;
}

/**
 * Fill missing time fields from the available two.
 * GTFS-RT provides {time, delay, scheduled_time} but only two may be present.
 * Consumer: convert bigint->number, fill 2-of-3 patterns. Don't filter 0.
 * @returns in POSIX epoch (seconds)
 */
export function normalizeTimes(
    scheduledTime: bigint | number | Date | null | undefined,
    time: bigint | number | Date | null | undefined,
    delay: bigint | number | null | undefined,
): { scheduledTime: number; time: number; delay: number } {
    let s =
        scheduledTime instanceof Date ? scheduledTime.getTime() / 1000 : toNumber(scheduledTime);
    let t = time instanceof Date ? time.getTime() / 1000 : toNumber(time);
    let d = toNumber(delay);

    if (t != null && d != null && s == null) {
        s = t - d;
    } else if (t != null && s != null && d == null) {
        d = t - s;
    } else if (s != null && d != null && t == null) {
        t = s + d;
    } else if (s == null && t == null && d == null) {
        // All three are null, return
        throw new Error("Not enough info: requires 2-of-3 in time, delay, scheduled time");
    }

    return { scheduledTime: s!, time: t!, delay: d! };
}

// =========================================================
// TranslatedString -> TranslationMap
// =========================================================

export function translatedStringToMap(ts: TranslatedString | undefined): TranslationMap {
    if (!ts || ts.translation.length === 0) {
        return { default: "" };
    }
    const map: TranslationMap = { default: "" };
    for (const t of ts.translation) {
        if (!t.language || t.language === "") {
            map.default = t.text;
        } else if (!(t.language in map)) {
            map[t.language] = t.text;
        }
    }
    // Ensure default is set - use first translation if no explicit default
    if (!map.default && ts.translation.length > 0) {
        const first = ts.translation[0];
        if (first) map.default = first.text;
    }
    return map;
}

// =========================================================
// Enum maps: Proto -> PG enum strings
// =========================================================

export function mapTripDescriptorScheduleRelationship(
    sr: TripDescriptor_ScheduleRelationship,
): TripInstanceState {
    // We consider all modification via RT data as "dirty"
    // except for removal of a trip
    switch (sr) {
        case TripDescriptor_ScheduleRelationship.CANCELED:
            return "REMOVED";
        case TripDescriptor_ScheduleRelationship.DELETED:
            return "REMOVED";
        default:
            return "DIRTY";
    }
}

export function mapStopTimeUpdateScheduleRelationship(
    sr: TripUpdate_StopTimeUpdate_ScheduleRelationship,
): StopTimeUpdateScheduleRelationship {
    switch (sr) {
        case TripUpdate_StopTimeUpdate_ScheduleRelationship.SCHEDULED:
            return "SCHEDULED";
        case TripUpdate_StopTimeUpdate_ScheduleRelationship.SKIPPED:
            return "SKIPPED";
        case TripUpdate_StopTimeUpdate_ScheduleRelationship.NO_DATA:
            return "NO_DATA";
        case TripUpdate_StopTimeUpdate_ScheduleRelationship.UNSCHEDULED:
            return "UNSCHEDULED";
        default:
            return "SCHEDULED";
    }
}

export function mapPickupDropoffType(
    t: TripUpdate_StopTimeUpdate_StopTimeProperties_DropOffPickupType,
): PickupDropOff {
    switch (t) {
        case TripUpdate_StopTimeUpdate_StopTimeProperties_DropOffPickupType.REGULAR:
            return "REGULAR";
        case TripUpdate_StopTimeUpdate_StopTimeProperties_DropOffPickupType.NONE:
            return "NO_PICKUP_OR_DROP_OFF";
        case TripUpdate_StopTimeUpdate_StopTimeProperties_DropOffPickupType.PHONE_AGENCY:
            return "PHONE_AGENCY";
        case TripUpdate_StopTimeUpdate_StopTimeProperties_DropOffPickupType.COORDINATE_WITH_DRIVER:
            return "COORDINATE_WITH_DRIVER";
        default:
            return "REGULAR";
    }
}

export function mapDirection(directionId: number | undefined): Direction | undefined {
    if (directionId === 0) return "OUTBOUND";
    if (directionId === 1) return "INBOUND";
    return undefined;
}

export function mapRouteType(routeType: number | undefined): RouteType | undefined {
    switch (routeType) {
        case 0:
            return "TRAM";
        case 1:
            return "SUBWAY";
        case 2:
            return "RAIL";
        case 3:
            return "BUS";
        case 4:
            return "FERRY";
        case 5:
            return "CABLE_TRAM";
        case 6:
            return "AERIAL_LIFT";
        case 7:
            return "FUNICULAR";
        case 11:
            return "TROLLEYBUS";
        case 12:
            return "MONORAIL";
        default:
            return undefined;
    }
}

export function mapVehicleStopStatus(s: VehiclePosition_VehicleStopStatus): VehicleStopStatus {
    switch (s) {
        case VehiclePosition_VehicleStopStatus.INCOMING_AT:
            return "INCOMING_AT";
        case VehiclePosition_VehicleStopStatus.STOPPED_AT:
            return "STOPPED_AT";
        case VehiclePosition_VehicleStopStatus.IN_TRANSIT_TO:
            return "IN_TRANSIT_TO";
        default:
            return "IN_TRANSIT_TO";
    }
}

export function mapCongestionLevel(c: VehiclePosition_CongestionLevel): CongestionLevel {
    switch (c) {
        case VehiclePosition_CongestionLevel.UNKNOWN_CONGESTION_LEVEL:
            return "UNKNOWN_CONGESTION_LEVEL";
        case VehiclePosition_CongestionLevel.RUNNING_SMOOTHLY:
            return "RUNNING_SMOOTHLY";
        case VehiclePosition_CongestionLevel.STOP_AND_GO:
            return "STOP_AND_GO";
        case VehiclePosition_CongestionLevel.CONGESTION:
            return "CONGESTION";
        case VehiclePosition_CongestionLevel.SEVERE_CONGESTION:
            return "SEVERE_CONGESTION";
        default:
            return "UNKNOWN_CONGESTION_LEVEL";
    }
}

export function mapOccupancyStatus(o: VehiclePosition_OccupancyStatus): OccupancyStatus {
    switch (o) {
        case VehiclePosition_OccupancyStatus.EMPTY:
            return "EMPTY";
        case VehiclePosition_OccupancyStatus.MANY_SEATS_AVAILABLE:
            return "MANY_SEATS_AVAILABLE";
        case VehiclePosition_OccupancyStatus.FEW_SEATS_AVAILABLE:
            return "FEW_SEATS_AVAILABLE";
        case VehiclePosition_OccupancyStatus.STANDING_ROOM_ONLY:
            return "STANDING_ROOM_ONLY";
        case VehiclePosition_OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY:
            return "CRUSHED_STANDING_ROOM_ONLY";
        case VehiclePosition_OccupancyStatus.FULL:
            return "FULL";
        case VehiclePosition_OccupancyStatus.NOT_ACCEPTING_PASSENGERS:
            return "NOT_ACCEPTING_PASSENGERS";
        case VehiclePosition_OccupancyStatus.NO_DATA_AVAILABLE:
            return "NO_DATA_AVAILABLE";
        case VehiclePosition_OccupancyStatus.NOT_BOARDABLE:
            return "NOT_BOARDABLE";
        default:
            return "NO_DATA_AVAILABLE";
    }
}

export function mapAlertCause(c: Alert_Cause): AlertCause {
    const map: Record<number, AlertCause> = {
        [Alert_Cause.UNKNOWN_CAUSE]: "UNKNOWN_CAUSE",
        [Alert_Cause.OTHER_CAUSE]: "OTHER_CAUSE",
        [Alert_Cause.TECHNICAL_PROBLEM]: "TECHNICAL_PROBLEM",
        [Alert_Cause.STRIKE]: "STRIKE",
        [Alert_Cause.DEMONSTRATION]: "DEMONSTRATION",
        [Alert_Cause.ACCIDENT]: "ACCIDENT",
        [Alert_Cause.HOLIDAY]: "HOLIDAY",
        [Alert_Cause.WEATHER]: "WEATHER",
        [Alert_Cause.MAINTENANCE]: "MAINTENANCE",
        [Alert_Cause.CONSTRUCTION]: "CONSTRUCTION",
        [Alert_Cause.POLICE_ACTIVITY]: "POLICE_ACTIVITY",
        [Alert_Cause.MEDICAL_EMERGENCY]: "MEDICAL_EMERGENCY",
    };
    return map[c] ?? "UNKNOWN_CAUSE";
}

export function mapAlertEffect(e: Alert_Effect): AlertEffect {
    const map: Record<number, AlertEffect> = {
        [Alert_Effect.NO_SERVICE]: "NO_SERVICE",
        [Alert_Effect.REDUCED_SERVICE]: "REDUCED_SERVICE",
        [Alert_Effect.SIGNIFICANT_DELAYS]: "SIGNIFICANT_DELAYS",
        [Alert_Effect.DETOUR]: "DETOUR",
        [Alert_Effect.ADDITIONAL_SERVICE]: "ADDITIONAL_SERVICE",
        [Alert_Effect.MODIFIED_SERVICE]: "MODIFIED_SERVICE",
        [Alert_Effect.OTHER_EFFECT]: "OTHER_EFFECT",
        [Alert_Effect.UNKNOWN_EFFECT]: "UNKNOWN_EFFECT",
        [Alert_Effect.STOP_MOVED]: "STOP_MOVED",
        [Alert_Effect.NO_EFFECT]: "NO_EFFECT",
        [Alert_Effect.ACCESSIBILITY_ISSUE]: "ACCESSIBILITY_ISSUE",
    };
    return map[e] ?? "UNKNOWN_EFFECT";
}

export function mapAlertSeverity(s: Alert_SeverityLevel): AlertSeverity {
    switch (s) {
        case Alert_SeverityLevel.UNKNOWN_SEVERITY:
            return "UNKNOWN_SEVERITY";
        case Alert_SeverityLevel.INFO:
            return "INFO";
        case Alert_SeverityLevel.WARNING:
            return "WARNING";
        case Alert_SeverityLevel.SEVERE:
            return "SEVERE";
        default:
            return "UNKNOWN_SEVERITY";
    }
}

export function mapWheelchairAccessible(
    w: VehicleDescriptor_WheelchairAccessible,
): Accessability | undefined {
    switch (w) {
        case VehicleDescriptor_WheelchairAccessible.NO_VALUE:
            return undefined;
        case VehicleDescriptor_WheelchairAccessible.UNKNOWN:
            return "NO_INFO";
        case VehicleDescriptor_WheelchairAccessible.WHEELCHAIR_ACCESSIBLE:
            return "ACCESSIBLE";
        case VehicleDescriptor_WheelchairAccessible.WHEELCHAIR_INACCESSIBLE:
            return "NOT_ACCESSIBLE";
        default:
            return undefined;
    }
}

// =========================================================
// Alert content hash (for dedup)
// =========================================================

/** WARNING: This is not a general purpose canonicalizer. Only intended for use with input object in computeAlertHash */
function canonicalize<T>(value: T): T {
    if (Array.isArray(value)) {
        return value
            .map(canonicalize)
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) as T;
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, v]) => v !== undefined)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([k, v]) => [k, canonicalize(v)]),
        ) as T;
    }

    return value;
}

export function computeAlertHash(data: {
    cause: string;
    effect: string;
    severity: string;
    headerText: TranslationMap;
    descriptionText: TranslationMap;
    url: TranslationMap | null;
    activePeriods: TimePeriod[];
    informedEntities: EntitySelector[];
}): string {
    const canonical = canonicalize(data);
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
