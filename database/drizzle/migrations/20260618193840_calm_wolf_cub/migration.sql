CREATE TYPE "transit"."alert_status" AS ENUM('ACTIVE', 'UPCOMING', 'INACTIVE');--> statement-breakpoint
DROP VIEW "transit"."active_alerts";--> statement-breakpoint
CREATE VIEW "transit"."active_alerts" AS (with "alerts_with_status" as (select "id", "agency_id", "content_hash", "cause", "effect", "severity", "header_text", "description_text", "url", "active_periods", "informed_entities", "last_seen", 
                        CASE
                            WHEN (
                                "active_periods" IS NULL
                                AND "last_seen" >= now() - interval '5 minutes'
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM jsonb_array_elements("active_periods") AS period
                                WHERE
                                    (period->>'start' IS NULL OR (period->>'start')::bigint <= extract(epoch FROM now()))
                                    AND (period->>'end' IS NOT NULL AND (period->>'end')::bigint >= extract(epoch FROM now()))
                            )
                            OR (
                                EXISTS (
                                    SELECT 1
                                    FROM jsonb_array_elements("active_periods") AS period
                                    WHERE
                                        (period->>'start' IS NULL OR (period->>'start')::bigint <= extract(epoch FROM now()))
                                        AND period->>'end' IS NULL
                                )
                                AND "last_seen" >= now() - interval '5 minutes'
                            )
                            THEN 'ACTIVE'::transit.alert_status

                            WHEN EXISTS (
                                SELECT 1
                                FROM jsonb_array_elements("active_periods") AS period
                                WHERE
                                    (period->>'start')::bigint > extract(epoch FROM now())
                                    AND (period->>'start')::bigint <= extract(epoch FROM now() + interval '1 month')
                            )
                            THEN 'UPCOMING'::transit.alert_status

                            ELSE 'INACTIVE'::transit.alert_status
                        END
                     as "status" from "transit"."alerts") select "id", "agency_id", "content_hash", "cause", "effect", "severity", "header_text", "description_text", "url", "active_periods", "informed_entities", "last_seen", "status" from "alerts_with_status" where "alerts_with_status"."status" != 'INACTIVE'::transit.alert_status);