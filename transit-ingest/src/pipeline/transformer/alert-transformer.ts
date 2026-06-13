import { isFieldSet } from "@bufbuild/protobuf";
import type { AlertCause, AlertEffect, AlertSeverity } from "database/models/enums";
import type { EntitySelector, TimePeriod, TranslationMap } from "database/models/types";
import { fromAsyncThrowable } from "neverthrow";
import {
    EntitySelectorSchema,
    TimeRangeSchema,
    type Alert as ProtoAlert,
    type EntitySelector as ProtoEntitySelector,
    type TimeRange as ProtoTimeRange,
} from "../../gen/proto/gtfs-realtime_pb";
import {
    computeAlertHash,
    extractCoreTripSid,
    mapAlertCause,
    mapAlertEffect,
    mapAlertSeverity,
    mapDirection,
    mapRouteType,
    translatedStringToMap,
} from "../../utils/realtime-helpers";
import type { Context } from "../core/context";
import { itemOk, type ItemResult } from "../core/error";
import type { Transform } from "../core/pipe";
import type { ParsedEntity } from "./protobuf-decoder";

export interface TransformedAlert {
    agencyId: string;
    contentHash: string;
    cause: AlertCause;
    effect: AlertEffect;
    severity: AlertSeverity;
    headerText: TranslationMap;
    descriptionText: TranslationMap;
    url: TranslationMap | null;
    activePeriods: TimePeriod[];
    informedEntities: EntitySelector[];
    lastSeen: Date;
}

export class AlertTransformer implements Transform<ParsedEntity, TransformedAlert> {
    async *run(
        ctx: Context,
        input: AsyncIterable<ParsedEntity>,
    ): AsyncIterable<ItemResult<TransformedAlert>> {
        for await (const { entity, feedTimestamp } of input) {
            if (!entity.alert) continue;
            yield await this.transform(ctx, entity.alert, feedTimestamp);
        }
    }

    private getTrip(ctx: Context, tripSid: string) {
        return fromAsyncThrowable(
            () =>
                ctx.db.query.trips.findFirst({
                    where: { agencyId: ctx.config.agencyId, tripSid },
                    columns: { id: true },
                }),
            (e: unknown) => e,
        )();
    }

    private getTripInstance(ctx: Context, tripId: number, startDate: string, startTime: string) {
        return fromAsyncThrowable(
            () =>
                ctx.db.query.tripInstances.findFirst({
                    where: { tripId, startDate, startTime },
                }),
            (e: unknown) => e,
        )();
    }

    private getRoute(ctx: Context, routeSid: string) {
        return fromAsyncThrowable(
            () =>
                ctx.db.query.routes.findFirst({
                    where: { agencyId: ctx.config.agencyId, routeSid },
                    columns: { id: true },
                }),
            (e: unknown) => e,
        )();
    }

    private getStop(ctx: Context, stopSid: string) {
        return fromAsyncThrowable(
            () =>
                ctx.db.query.stops.findFirst({
                    where: { agencyId: ctx.config.agencyId, stopSid },
                    columns: { id: true },
                }),
            (e: unknown) => e,
        )();
    }

    private getAgency(ctx: Context, agencySid: string) {
        return fromAsyncThrowable(
            () =>
                ctx.db.query.agencies.findFirst({
                    where: { agencySid },
                    columns: { id: true },
                }),
            (e: unknown) => e,
        )();
    }

    private async resolveTripInstanceId(
        ctx: Context,
        tripDescriptor: { tripId: string; startDate: string; startTime: string },
    ) {
        const coreTripSid = extractCoreTripSid(tripDescriptor.tripId);
        const tripResult = await this.getTrip(ctx, coreTripSid);
        if (tripResult.isErr()) {
            ctx.logger.debug({ tripSid: coreTripSid }, "DB error fetching trip for alert");
            return undefined;
        }
        if (!tripResult.value) {
            ctx.logger.debug({ tripSid: coreTripSid }, "Trip not found for alert");
            return undefined;
        }
        const tiResult = await this.getTripInstance(
            ctx,
            tripResult.value.id,
            tripDescriptor.startDate,
            tripDescriptor.startTime,
        );
        if (tiResult.isErr() || !tiResult.value) {
            ctx.logger.debug({ tripSid: coreTripSid }, "Trip instance not found for alert");
            return undefined;
        }
        return tiResult.value.id;
    }

    private async mapEntitySelector(
        ctx: Context,
        ie: ProtoEntitySelector,
    ): Promise<EntitySelector> {
        const tripInstanceId =
            isFieldSet(ie, EntitySelectorSchema.field.trip) &&
            ie.trip?.tripId &&
            ie.trip.startDate &&
            ie.trip.startTime
                ? await this.resolveTripInstanceId(ctx, {
                      tripId: ie.trip.tripId,
                      startDate: ie.trip.startDate,
                      startTime: ie.trip.startTime,
                  })
                : undefined;

        const routeId = isFieldSet(ie, EntitySelectorSchema.field.routeId)
            ? await this.getRoute(ctx, ie.routeId).match(
                  (r) => r?.id,
                  (_) => undefined,
              )
            : undefined;
        const stopId = isFieldSet(ie, EntitySelectorSchema.field.stopId)
            ? await this.getStop(ctx, ie.stopId).match(
                  (s) => s?.id,
                  (_) => undefined,
              )
            : undefined;

        const agencyId = isFieldSet(ie, EntitySelectorSchema.field.agencyId)
            ? await this.getAgency(ctx, ie.agencyId).match(
                  (a) => a?.id,
                  (_) => undefined,
              )
            : undefined;

        return {
            agencyId,
            tripInstanceId,
            routeId,
            stopId,
            routeType: isFieldSet(ie, EntitySelectorSchema.field.routeType)
                ? mapRouteType(ie.routeType)
                : undefined,
            direction: isFieldSet(ie, EntitySelectorSchema.field.directionId)
                ? mapDirection(ie.directionId)
                : undefined,
        };
    }

    private mapTimeRange(p: ProtoTimeRange): TimePeriod {
        if (!isFieldSet(p, TimeRangeSchema.field.start)) {
            return { start: null, end: Number(p.end) };
        }
        if (!isFieldSet(p, TimeRangeSchema.field.end)) {
            return { start: Number(p.start), end: null };
        }
        return { start: Number(p.start), end: Number(p.end) };
    }

    private async transform(
        ctx: Context,
        alert: ProtoAlert,
        feedTimestamp: bigint,
    ): Promise<ItemResult<TransformedAlert>> {
        const activePeriods: TimePeriod[] = alert.activePeriod
            .filter(
                (p) =>
                    isFieldSet(p, TimeRangeSchema.field.start) ||
                    isFieldSet(p, TimeRangeSchema.field.end),
            )
            .map(this.mapTimeRange);

        const informedEntities: EntitySelector[] = await Promise.all(
            alert.informedEntity.map((ie) => this.mapEntitySelector(ctx, ie)),
        );

        const headerText = translatedStringToMap(alert.headerText);
        const descriptionText = translatedStringToMap(alert.descriptionText);
        const url = alert.url ? translatedStringToMap(alert.url) : null;

        const cause = mapAlertCause(alert.cause);
        const effect = mapAlertEffect(alert.effect);
        const severity = mapAlertSeverity(alert.severityLevel);

        const contentHash = computeAlertHash({
            cause,
            effect,
            severity,
            headerText,
            descriptionText,
            url,
            activePeriods,
            informedEntities,
        });

        const lastSeen = new Date(Number(feedTimestamp) * 1000);

        return itemOk({
            agencyId: ctx.config.agencyId,
            contentHash,
            cause,
            effect,
            severity,
            headerText,
            descriptionText,
            url,
            activePeriods,
            informedEntities,
            lastSeen,
        });
    }
}
