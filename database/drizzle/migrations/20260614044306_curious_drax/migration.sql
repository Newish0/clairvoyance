CREATE VIEW "transit"."active_alerts" AS (select "id", "agency_id", "content_hash", "cause", "effect", "severity", "header_text", "description_text", "url", "active_periods", "informed_entities", "last_seen" from "transit"."alerts" where 
                    (
                        "transit"."alerts"."active_periods" IS NULL
                        OR EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements("transit"."alerts"."active_periods") AS period
                            WHERE
                                (period->>'start' IS NULL OR (period->>'start')::bigint <= extract(epoch FROM now()))
                                AND
                                (period->>'end' IS NULL OR (period->>'end')::bigint >= extract(epoch FROM now()))
                        )
                    )
                    AND "transit"."alerts"."last_seen" >= now() - interval '5 minutes'
                );