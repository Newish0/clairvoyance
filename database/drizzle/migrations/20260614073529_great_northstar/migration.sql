DROP VIEW "transit"."stop_routes";--> statement-breakpoint
CREATE VIEW "transit"."stop_routes" AS (select "transit"."stop_times"."stop_id", 
                array_agg(
                    DISTINCT jsonb_build_object(
                        'id', "transit"."routes"."id",
                        'shortName', "transit"."routes"."short_name",
                        'color', "transit"."routes"."color",
                        'textColor', "transit"."routes"."text_color",
                        'type', "transit"."routes"."type"
                    )
                )
             as "routes" from "transit"."stop_times" inner join "transit"."trips" on "transit"."stop_times"."trip_id" = "transit"."trips"."id" inner join "transit"."routes" on "transit"."trips"."route_id" = "transit"."routes"."id" group by "transit"."stop_times"."stop_id");