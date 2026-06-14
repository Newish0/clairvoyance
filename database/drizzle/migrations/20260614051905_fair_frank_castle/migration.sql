DROP VIEW "transit"."active_alerts";--> statement-breakpoint
CREATE VIEW "transit"."active_alerts" AS (select "id", "agency_id", "content_hash", "cause", "effect", "severity", "header_text", "description_text", "url", "active_periods", "informed_entities", "last_seen" from "transit"."alerts" where 
                    -- Case 1: no time info at all - rely on lastSeen
                    (
                        "transit"."alerts"."active_periods" IS NULL
                        AND "transit"."alerts"."last_seen" >= now() - interval '5 minutes'
                    )
                    OR
                    -- Case 2: a bounded period covers now - active on its own terms
                    EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements("transit"."alerts"."active_periods") AS period
                        WHERE
                            (period->>'start' IS NULL OR (period->>'start')::bigint <= extract(epoch FROM now()))
                            AND (period->>'end' IS NOT NULL AND (period->>'end')::bigint >= extract(epoch FROM now()))
                    )
                    OR
                    -- Case 3: an open-ended period covers now - needs a fresh lastSeen
                    (
                        EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements("transit"."alerts"."active_periods") AS period
                            WHERE
                                (period->>'start' IS NULL OR (period->>'start')::bigint <= extract(epoch FROM now()))
                                AND period->>'end' IS NULL
                        )
                        AND "transit"."alerts"."last_seen" >= now() - interval '5 minutes'
                    )
                );