import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
    AlertCause,
    AlertEffect,
    AlertSeverityLevel,
    type EntitySelector,
    type Alert as GtfsAlert,
} from "gtfs-db-types";
import {
    AlertCircle,
    AlertTriangle,
    Calendar,
    Car,
    Clock,
    Cloud,
    Construction,
    Heart,
    Info,
    MapPin,
    Megaphone,
    Shield,
    Users,
    Wrench,
    XCircle,
    Zap,
} from "lucide-solid";
import { type Component, createMemo, Match, Show, Switch } from "solid-js";

// Helper components
interface CauseIconProps {
    cause?: AlertCause;
}

const CauseIcon: Component<CauseIconProps> = (props) => {
    return (
        <Switch fallback={<Info class="h-4 w-4 flex-shrink-0" />}>
            <Match when={props.cause === AlertCause.TECHNICAL_PROBLEM}>
                <Zap class="h-4 w-4 flex-shrink-0" />
            </Match>
            <Match when={props.cause === AlertCause.STRIKE}>
                <Users class="h-4 w-4 flex-shrink-0" />
            </Match>
            <Match when={props.cause === AlertCause.DEMONSTRATION}>
                <Megaphone class="h-4 w-4 flex-shrink-0" />
            </Match>
            <Match when={props.cause === AlertCause.ACCIDENT}>
                <Car class="h-4 w-4 flex-shrink-0" />
            </Match>
            <Match when={props.cause === AlertCause.HOLIDAY}>
                <Calendar class="h-4 w-4 flex-shrink-0" />
            </Match>
            <Match when={props.cause === AlertCause.WEATHER}>
                <Cloud class="h-4 w-4 flex-shrink-0" />
            </Match>
            <Match when={props.cause === AlertCause.MAINTENANCE}>
                <Wrench class="h-4 w-4 flex-shrink-0" />
            </Match>
            <Match when={props.cause === AlertCause.CONSTRUCTION}>
                <Construction class="h-4 w-4 flex-shrink-0" />
            </Match>
            <Match when={props.cause === AlertCause.POLICE_ACTIVITY}>
                <Shield class="h-4 w-4 flex-shrink-0" />
            </Match>
            <Match when={props.cause === AlertCause.MEDICAL_EMERGENCY}>
                <Heart class="h-4 w-4 flex-shrink-0" />
            </Match>
        </Switch>
    );
};

const getSeverityConfig = (severity?: AlertSeverityLevel | null) => {
    switch (severity) {
        case AlertSeverityLevel.SEVERE:
            return {
                variant: "destructive" as const,
                icon: <XCircle class="h-4 w-4" />,
                badge: "Severe",
                badgeVariant: "destructive" as const,
            };
        case AlertSeverityLevel.WARNING:
            return {
                variant: "default" as const,
                icon: <AlertTriangle class="h-4 w-4" />,
                badge: "Warning",
                badgeVariant: "secondary" as const,
            };
        case AlertSeverityLevel.INFO:
            return {
                variant: "default" as const,
                icon: <Info class="h-4 w-4" />,
                badge: "Info",
                badgeVariant: "outline" as const,
            };
        default:
            return {
                variant: "default" as const,
                icon: <AlertCircle class="h-4 w-4" />,
                badge: "Alert",
                badgeVariant: "secondary" as const,
            };
    }
};

const getCauseLabel = (cause?: AlertCause): string => {
    const labels = {
        [AlertCause.UNKNOWN_CAUSE]: "Unknown Issue",
        [AlertCause.OTHER_CAUSE]: "Other Issue",
        [AlertCause.TECHNICAL_PROBLEM]: "Technical Problem",
        [AlertCause.STRIKE]: "Strike",
        [AlertCause.DEMONSTRATION]: "Demonstration",
        [AlertCause.ACCIDENT]: "Accident",
        [AlertCause.HOLIDAY]: "Holiday",
        [AlertCause.WEATHER]: "Weather",
        [AlertCause.MAINTENANCE]: "Maintenance",
        [AlertCause.CONSTRUCTION]: "Construction",
        [AlertCause.POLICE_ACTIVITY]: "Police Activity",
        [AlertCause.MEDICAL_EMERGENCY]: "Medical Emergency",
    };
    return cause ? labels[cause] : "Unknown Issue";
};

const getEffectLabel = (effect?: AlertEffect): string => {
    const labels = {
        [AlertEffect.NO_SERVICE]: "No Service",
        [AlertEffect.REDUCED_SERVICE]: "Reduced Service",
        [AlertEffect.SIGNIFICANT_DELAYS]: "Significant Delays",
        [AlertEffect.DETOUR]: "Detour",
        [AlertEffect.ADDITIONAL_SERVICE]: "Additional Service",
        [AlertEffect.MODIFIED_SERVICE]: "Modified Service",
        [AlertEffect.OTHER_EFFECT]: "Service Impact",
        [AlertEffect.UNKNOWN_EFFECT]: "Service Impact",
        [AlertEffect.STOP_MOVED]: "Stop Moved",
        [AlertEffect.NO_EFFECT]: "No Effect",
        [AlertEffect.ACCESSIBILITY_ISSUE]: "Accessibility Issue",
    };
    return effect ? labels[effect] : "Service Impact";
};

const formatAffectedStops = (
    entities?: EntitySelector[],
    stopNames?: Record<string, string | null>
): string => {
    if (!entities || entities.length === 0) return "Multiple locations";

    const stops = entities
        .filter((e) => e.stop_id)
        .map((e) => stopNames?.[e.stop_id!] || e.stop_id!)
        .filter(Boolean);

    if (stops.length === 0) return "Multiple locations";
    if (stops.length === 1) return stops[0];
    if (stops.length === 2) return `${stops[0]} and ${stops[1]}`;
    // if (stops.length <= 3)
    return `${stops.slice(0, -1).join(", ")}, and ${stops[stops.length - 1]}`;

    // return `${stops.slice(0, 2).join(", ")} and ${stops.length - 2} other stops`;
};

interface TransitAlertProps {
    alert: GtfsAlert;
    stopNames?: Record<string, string | null>;
}

const TransitAlert: Component<TransitAlertProps> = (props) => {
    const severityConfig = createMemo(() => getSeverityConfig(props.alert.severity_level));
    const affectedStops = createMemo(() =>
        formatAffectedStops(props.alert.informed_entities, props.stopNames)
    );

    const headerText = createMemo(
        () => props.alert.header_text?.[0]?.text || getEffectLabel(props.alert.effect)
    );

    const descriptionText = createMemo(
        () =>
            props.alert.description_text?.[0]?.text ||
            `Due to ${getCauseLabel(props.alert.cause).toLowerCase()}, there is ${getEffectLabel(
                props.alert.effect
            ).toLowerCase()} at ${affectedStops()}`
    );

    return (
        <Card class="w-full">
            <CardContent class="p-0">
                <Alert
                    class={`border-0 rounded-lg ${
                        severityConfig().variant === "destructive"
                            ? "border-l-4 border-destructive-foreground"
                            : ""
                    }`}
                    variant={severityConfig().variant}
                >
                    <div class="flex items-start gap-3">
                        <div class="flex-shrink-0 mt-0.5">{severityConfig().icon}</div>

                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-2">
                                <AlertTitle class="text-base font-semibold m-0">
                                    {headerText()}
                                </AlertTitle>
                                <Badge
                                    variant={
                                        severityConfig().badgeVariant === "destructive"
                                            ? "error"
                                            : (severityConfig().badgeVariant as
                                                  | "secondary"
                                                  | "outline")
                                    }
                                    class="text-xs"
                                >
                                    {severityConfig().badge}
                                </Badge>
                            </div>

                            <AlertDescription class="text-sm text-muted-foreground mb-3 m-0">
                                {descriptionText()}
                            </AlertDescription>

                            <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-2">
                                <Show when={props.alert.cause}>
                                    <div class="flex items-center gap-1">
                                        <CauseIcon cause={props.alert.cause} />
                                        <span>{getCauseLabel(props.alert.cause)}</span>
                                    </div>
                                </Show>

                                <Show
                                    when={
                                        props.alert.informed_entities &&
                                        props.alert.informed_entities.length > 0
                                    }
                                >
                                    <div class="flex items-center gap-1">
                                        <MapPin class="h-4 w-4 flex-shrink-0" />
                                        <span>{affectedStops()}</span>
                                    </div>
                                </Show>

                                <Show when={props.alert.updated_at}>
                                    <div class="flex items-center gap-1">
                                        <Clock class="h-4 w-4 flex-shrink-0" />
                                        <span>
                                            Updated{" "}
                                            {new Date(props.alert.updated_at!).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </Show>
                            </div>
                        </div>
                    </div>
                </Alert>
            </CardContent>
        </Card>
    );
};

export default TransitAlert;

// // Main component
// interface TransitAlertsProps {
//     alertData: AlertData;
// }

// const TransitAlerts: Component<TransitAlertsProps> = (props) => {
//     const alerts = () => props.alertData.alerts;
//     const lookup = () => props.alertData.lookup;

//     const sortedAlerts = createMemo(() => {
//         if (!alerts() || alerts().length === 0) return [];

//         // Sort alerts by severity (severe first)
//         return [...alerts()].sort((a, b) => {
//             const severityOrder = { 4: 0, 3: 1, 2: 2, 1: 3 }; // SEVERE, WARNING, INFO, UNKNOWN
//             const aSeverity = a.severity_level || AlertSeverityLevel.UNKNOWN_SEVERITY;
//             const bSeverity = b.severity_level || AlertSeverityLevel.UNKNOWN_SEVERITY;
//             return (
//                 (severityOrder[aSeverity as keyof typeof severityOrder] || 3) -
//                 (severityOrder[bSeverity as keyof typeof severityOrder] || 3)
//             );
//         });
//     });

//     return (
//         <Show
//             when={alerts() && alerts().length > 0}
//             fallback={
//                 <Card class="w-full max-w-2xl mx-auto">
//                     <CardContent class="p-6 text-center">
//                         <Info class="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
//                         <p class="text-muted-foreground">No active service alerts</p>
//                     </CardContent>
//                 </Card>
//             }
//         >
//             <div class="w-full max-w-2xl mx-auto space-y-4">
//                 <div class="flex items-center gap-2 mb-4">
//                     <AlertTriangle class="h-5 w-5" />
//                     <h2 class="text-lg font-semibold">Service Alerts</h2>
//                     <Badge variant="outline" class="ml-auto">
//                         {alerts().length} active
//                     </Badge>
//                 </div>

//                 <For each={sortedAlerts()}>
//                     {(alert, index) => (
//                         <TransitAlert alert={alert} stopNames={lookup().stop_names} />
//                     )}
//                 </For>
//             </div>
//         </Show>
//     );
// };
