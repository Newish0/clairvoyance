--
-- File generated with SQLiteStudio v3.4.4 on Tue Apr 2 23:57:50 2024
--
-- Text encoding used: System
--
PRAGMA foreign_keys = off;
BEGIN TRANSACTION;
-- Table: agency
CREATE TABLE IF NOT EXISTS agency (
    agency_id varchar(255),
    agency_name varchar(255) NOT NULL COLLATE NOCASE,
    agency_url varchar(2047) NOT NULL,
    agency_timezone varchar(255) NOT NULL,
    agency_lang varchar(255) COLLATE NOCASE,
    agency_phone varchar(64) COLLATE NOCASE,
    agency_fare_url varchar(2047),
    agency_email varchar(255) COLLATE NOCASE,
    PRIMARY KEY (agency_id)
);


-- Table: areas
CREATE TABLE IF NOT EXISTS areas (
    area_id varchar(255) NOT NULL,
    area_name varchar(255),
    PRIMARY KEY (area_id)
);
-- Table: attributions
CREATE TABLE IF NOT EXISTS attributions (
    attribution_id varchar(255) NOT NULL,
    agency_id varchar(255),
    route_id varchar(255),
    trip_id varchar(255),
    organization_name varchar(255) NOT NULL COLLATE NOCASE,
    is_producer integer CHECK(
        is_producer >= 0
        AND is_producer <= 1
    ),
    is_operator integer CHECK(
        is_operator >= 0
        AND is_operator <= 1
    ),
    is_authority integer CHECK(
        is_authority >= 0
        AND is_authority <= 1
    ),
    attribution_url varchar(2047),
    attribution_email varchar(255) COLLATE NOCASE,
    attribution_phone varchar(255) COLLATE NOCASE,
    PRIMARY KEY (attribution_id)
);
-- Table: board_alight
CREATE TABLE IF NOT EXISTS board_alight (
    trip_id varchar(255) NOT NULL,
    stop_id varchar(255) NOT NULL,
    stop_sequence integer NOT NULL,
    record_use integer CHECK(
        record_use >= 0
        AND record_use <= 1
    ) NOT NULL,
    schedule_relationship integer CHECK(
        schedule_relationship >= 0
        AND schedule_relationship <= 8
    ),
    boardings integer,
    alightings integer,
    current_load integer,
    load_count integer,
    load_type integer CHECK(
        load_type >= 0
        AND load_type <= 1
    ),
    rack_down integer CHECK(
        rack_down >= 0
        AND rack_down <= 1
    ),
    bike_boardings integer,
    bike_alightings integer,
    ramp_used integer CHECK(
        ramp_used >= 0
        AND ramp_used <= 1
    ),
    ramp_boardings integer,
    ramp_alightings integer,
    service_date integer,
    service_arrival_time varchar(255),
    service_arrival_timestamp integer,
    service_departure_time varchar(255),
    service_departure_timestamp integer,
    source integer CHECK(
        source >= 0
        AND source <= 4
    )
);
-- Table: calendar
CREATE TABLE IF NOT EXISTS calendar (
    service_id varchar(255) NOT NULL,
    monday integer CHECK(
        monday >= 0
        AND monday <= 1
    ) NOT NULL,
    tuesday integer CHECK(
        tuesday >= 0
        AND tuesday <= 1
    ) NOT NULL,
    wednesday integer CHECK(
        wednesday >= 0
        AND wednesday <= 1
    ) NOT NULL,
    thursday integer CHECK(
        thursday >= 0
        AND thursday <= 1
    ) NOT NULL,
    friday integer CHECK(
        friday >= 0
        AND friday <= 1
    ) NOT NULL,
    saturday integer CHECK(
        saturday >= 0
        AND saturday <= 1
    ) NOT NULL,
    sunday integer CHECK(
        sunday >= 0
        AND sunday <= 1
    ) NOT NULL,
    start_date integer NOT NULL,
    end_date integer NOT NULL,
    PRIMARY KEY (service_id)
);
-- Table: calendar_attributes
CREATE TABLE IF NOT EXISTS calendar_attributes (
    service_id varchar(255),
    service_description varchar(255) NOT NULL COLLATE NOCASE,
    PRIMARY KEY (service_id)
);
-- Table: calendar_dates
CREATE TABLE IF NOT EXISTS calendar_dates (
    service_id varchar(255) NOT NULL,
    date integer NOT NULL,
    exception_type integer CHECK(
        exception_type >= 1
        AND exception_type <= 2
    ) NOT NULL,
    holiday_name varchar(255) COLLATE NOCASE,
    PRIMARY KEY (service_id, date)
);
-- Table: deadhead_times
CREATE TABLE IF NOT EXISTS deadhead_times (
    id integer,
    deadhead_id varchar(255) NOT NULL,
    arrival_time varchar(255) NOT NULL,
    arrival_timestamp integer,
    departure_time varchar(255) NOT NULL,
    departure_timestamp integer,
    ops_location_id varchar(255),
    stop_id varchar(255),
    location_sequence integer NOT NULL,
    shape_dist_traveled real,
    PRIMARY KEY (id)
);
-- Table: deadheads
CREATE TABLE IF NOT EXISTS deadheads (
    deadhead_id varchar(255) NOT NULL,
    service_id varchar(255) NOT NULL,
    block_id varchar(255) NOT NULL,
    shape_id varchar(255),
    to_trip_id varchar(255),
    from_trip_id varchar(255),
    to_deadhead_id varchar(255),
    from_deadhead_id varchar(255),
    PRIMARY KEY (deadhead_id)
);
-- Table: directions
CREATE TABLE IF NOT EXISTS directions (
    route_id varchar(255) NOT NULL,
    direction_id integer CHECK(
        direction_id >= 0
        AND direction_id <= 1
    ),
    direction varchar(255) NOT NULL,
    PRIMARY KEY (route_id, direction_id)
);
-- Table: fare_attributes
CREATE TABLE IF NOT EXISTS fare_attributes (
    fare_id varchar(255) NOT NULL,
    price real NOT NULL,
    currency_type varchar(255) NOT NULL,
    payment_method integer CHECK(
        payment_method >= 0
        AND payment_method <= 1
    ) NOT NULL,
    transfers integer CHECK(
        transfers >= 0
        AND transfers <= 2
    ),
    agency_id varchar(255),
    transfer_duration integer,
    PRIMARY KEY (fare_id)
);
-- Table: fare_leg_rules
CREATE TABLE IF NOT EXISTS fare_leg_rules (
    leg_group_id varchar(255),
    network_id varchar(255),
    from_area_id varchar(255),
    to_area_id varchar(255),
    fare_product_id varchar(255) NOT NULL,
    PRIMARY KEY (
        network_id,
        from_area_id,
        to_area_id,
        fare_product_id
    )
);
-- Table: fare_products
CREATE TABLE IF NOT EXISTS fare_products (
    fare_product_id varchar(255) NOT NULL,
    fare_product_name varchar(255),
    fare_media_id varchar(255),
    amount real NOT NULL,
    currency varchar(255) NOT NULL,
    PRIMARY KEY (fare_product_id, fare_media_id)
);
-- Table: fare_rules
CREATE TABLE IF NOT EXISTS fare_rules (
    fare_id varchar(255) NOT NULL,
    route_id varchar(255),
    origin_id varchar(255),
    destination_id varchar(255),
    contains_id varchar(255)
);
-- Table: fare_transfer_rules
CREATE TABLE IF NOT EXISTS fare_transfer_rules (
    from_leg_group_id varchar(255),
    to_leg_group_id varchar(255),
    transfer_count integer CHECK(transfer_count >= -1),
    transfer_id varchar(255),
    duration_limit integer,
    duration_limit_type integer CHECK(
        duration_limit_type >= 0
        AND duration_limit_type <= 3
    ),
    fare_transfer_type integer CHECK(
        fare_transfer_type >= 0
        AND fare_transfer_type <= 2
    ) NOT NULL,
    fare_product_id varchar(255),
    PRIMARY KEY (
        from_leg_group_id,
        to_leg_group_id,
        transfer_count,
        duration_limit,
        fare_product_id
    )
);
-- Table: feed_info
CREATE TABLE IF NOT EXISTS feed_info (
    feed_publisher_name varchar(255) NOT NULL COLLATE NOCASE,
    feed_publisher_url varchar(2047) NOT NULL,
    feed_lang varchar(255) NOT NULL,
    default_lang varchar(255) COLLATE NOCASE,
    feed_start_date integer,
    feed_end_date integer,
    feed_version varchar(255),
    feed_contact_email varchar(255) COLLATE NOCASE,
    feed_contact_url varchar(2047)
);
-- Table: frequencies
CREATE TABLE IF NOT EXISTS frequencies (
    trip_id varchar(255) NOT NULL,
    start_time varchar(255) NOT NULL,
    start_timestamp integer,
    end_time varchar(255) NOT NULL,
    end_timestamp integer,
    headway_secs integer NOT NULL,
    exact_times integer CHECK(
        exact_times >= 0
        AND exact_times <= 1
    ),
    PRIMARY KEY (trip_id, start_time)
);
-- Table: levels
CREATE TABLE IF NOT EXISTS levels (
    level_id varchar(255) NOT NULL,
    level_index real NOT NULL,
    level_name varchar(255) COLLATE NOCASE,
    PRIMARY KEY (level_id)
);
-- Table: ops_locations
CREATE TABLE IF NOT EXISTS ops_locations (
    ops_location_id varchar(255) NOT NULL,
    ops_location_code varchar(255),
    ops_location_name varchar(255) NOT NULL COLLATE NOCASE,
    ops_location_desc varchar(255) COLLATE NOCASE,
    ops_location_lat real CHECK(
        ops_location_lat >= -90
        AND ops_location_lat <= 90
    ) NOT NULL,
    ops_location_lon real CHECK(
        ops_location_lon >= -180
        AND ops_location_lon <= 180
    ) NOT NULL,
    PRIMARY KEY (ops_location_id)
);
-- Table: pathways
CREATE TABLE IF NOT EXISTS pathways (
    pathway_id varchar(255) NOT NULL,
    from_stop_id varchar(255) NOT NULL,
    to_stop_id varchar(255) NOT NULL,
    pathway_mode integer CHECK(
        pathway_mode >= 1
        AND pathway_mode <= 7
    ) NOT NULL,
    is_bidirectional integer CHECK(
        is_bidirectional >= 0
        AND is_bidirectional <= 1
    ) NOT NULL,
    length real,
    traversal_time integer,
    stair_count integer,
    max_slope real,
    min_width real,
    signposted_as varchar(255) COLLATE NOCASE,
    reversed_signposted_as varchar(255) COLLATE NOCASE,
    PRIMARY KEY (pathway_id)
);
-- Table: ride_feed_info
CREATE TABLE IF NOT EXISTS ride_feed_info (
    ride_files integer CHECK(
        ride_files >= 0
        AND ride_files <= 6
    ) NOT NULL,
    ride_start_date integer,
    ride_end_date integer,
    gtfs_feed_date integer,
    default_currency_type varchar(255),
    ride_feed_version varchar(255)
);
-- Table: rider_trip
CREATE TABLE IF NOT EXISTS rider_trip (
    rider_id varchar(255),
    agency_id varchar(255),
    trip_id varchar(255),
    boarding_stop_id varchar(255),
    boarding_stop_sequence integer,
    alighting_stop_id varchar(255),
    alighting_stop_sequence integer,
    service_date integer,
    boarding_time varchar(255),
    boarding_timestamp integer,
    alighting_time varchar(255),
    alighting_timestamp integer,
    rider_type integer CHECK(
        rider_type >= 0
        AND rider_type <= 13
    ),
    rider_type_description varchar(255),
    fare_paid real,
    transaction_type integer CHECK(
        transaction_type >= 0
        AND transaction_type <= 8
    ),
    fare_media integer CHECK(
        fare_media >= 0
        AND fare_media <= 9
    ),
    accompanying_device integer CHECK(
        accompanying_device >= 0
        AND accompanying_device <= 6
    ),
    transfer_status integer CHECK(
        transfer_status >= 0
        AND transfer_status <= 1
    ),
    PRIMARY KEY (rider_id)
);
-- Table: ridership
CREATE TABLE IF NOT EXISTS ridership (
    total_boardings integer NOT NULL,
    total_alightings integer NOT NULL,
    ridership_start_date integer,
    ridership_end_date integer,
    ridership_start_time varchar(255),
    ridership_start_timestamp integer,
    ridership_end_time varchar(255),
    ridership_end_timestamp integer,
    service_id varchar(255),
    monday integer CHECK(
        monday >= 0
        AND monday <= 1
    ),
    tuesday integer CHECK(
        tuesday >= 0
        AND tuesday <= 1
    ),
    wednesday integer CHECK(
        wednesday >= 0
        AND wednesday <= 1
    ),
    thursday integer CHECK(
        thursday >= 0
        AND thursday <= 1
    ),
    friday integer CHECK(
        friday >= 0
        AND friday <= 1
    ),
    saturday integer CHECK(
        saturday >= 0
        AND saturday <= 1
    ),
    sunday integer CHECK(
        sunday >= 0
        AND sunday <= 1
    ),
    agency_id varchar(255),
    route_id varchar(255),
    direction_id integer CHECK(
        direction_id >= 0
        AND direction_id <= 1
    ),
    trip_id varchar(255),
    stop_id varchar(255)
);
-- Table: route_attributes
CREATE TABLE IF NOT EXISTS route_attributes (
    route_id varchar(255),
    category integer NOT NULL,
    subcategory integer CHECK(subcategory >= 101) NOT NULL,
    running_way integer CHECK(running_way >= 1) NOT NULL,
    PRIMARY KEY (route_id)
);
-- Table: routes
CREATE TABLE IF NOT EXISTS routes (
    route_id varchar(255) NOT NULL,
    agency_id varchar(255),
    route_short_name varchar(255) COLLATE NOCASE,
    route_long_name varchar(255) COLLATE NOCASE,
    route_desc varchar(255) COLLATE NOCASE,
    route_type integer NOT NULL,
    route_url varchar(2047),
    route_color varchar(255) COLLATE NOCASE,
    route_text_color varchar(255) COLLATE NOCASE,
    route_sort_order integer,
    continuous_pickup integer CHECK(
        continuous_pickup >= 0
        AND continuous_pickup <= 3
    ),
    continuous_drop_off integer CHECK(
        continuous_drop_off >= 0
        AND continuous_drop_off <= 3
    ),
    network_id varchar(255),
    PRIMARY KEY (route_id)
);
-- Table: run_event
CREATE TABLE IF NOT EXISTS run_event (
    run_event_id varchar(255) NOT NULL,
    piece_id varchar(255) NOT NULL,
    event_type integer NOT NULL,
    event_name varchar(255) COLLATE NOCASE,
    event_time varchar(255) NOT NULL,
    event_duration integer NOT NULL,
    event_from_location_type integer CHECK(
        event_from_location_type >= 0
        AND event_from_location_type <= 1
    ),
    event_from_location_id varchar(255),
    event_to_location_type integer CHECK(
        event_to_location_type >= 0
        AND event_to_location_type <= 1
    ),
    event_to_location_id varchar(255),
    PRIMARY KEY (run_event_id)
);
-- Table: runs_pieces
CREATE TABLE IF NOT EXISTS runs_pieces (
    run_id varchar(255) NOT NULL,
    piece_id varchar(255) NOT NULL,
    start_type integer CHECK(
        start_type >= 0
        AND start_type <= 2
    ) NOT NULL,
    start_trip_id varchar(255) NOT NULL,
    start_trip_position integer,
    end_type integer CHECK(
        end_type >= 0
        AND end_type <= 2
    ) NOT NULL,
    end_trip_id varchar(255) NOT NULL,
    end_trip_position integer,
    PRIMARY KEY (piece_id)
);
-- Table: service_alert_targets
CREATE TABLE IF NOT EXISTS service_alert_targets (
    alert_id varchar(255) NOT NULL,
    stop_id varchar(255),
    route_id varchar(255),
    is_updated integer CHECK(
        is_updated >= 0
        AND is_updated <= 1
    ) NOT NULL DEFAULT 1,
    PRIMARY KEY (alert_id)
);
-- Table: service_alerts
CREATE TABLE IF NOT EXISTS service_alerts (
    id varchar(255) NOT NULL,
    cause integer NOT NULL,
    start_time varchar(255) NOT NULL,
    end_time varchar(255) NOT NULL,
    headline varchar(2048) NOT NULL,
    description varchar(4096) NOT NULL,
    is_updated integer CHECK(
        is_updated >= 0
        AND is_updated <= 1
    ) NOT NULL DEFAULT 1,
    PRIMARY KEY (id)
);
-- Table: shapes
CREATE TABLE IF NOT EXISTS shapes (
    shape_id varchar(255) NOT NULL,
    shape_pt_lat real CHECK(
        shape_pt_lat >= -90
        AND shape_pt_lat <= 90
    ) NOT NULL,
    shape_pt_lon real CHECK(
        shape_pt_lon >= -180
        AND shape_pt_lon <= 180
    ) NOT NULL,
    shape_pt_sequence integer NOT NULL,
    shape_dist_traveled real,
    PRIMARY KEY (shape_id, shape_pt_sequence)
);
-- Table: stop_areas
CREATE TABLE IF NOT EXISTS stop_areas (
    area_id varchar(255) NOT NULL,
    stop_id varchar(255) NOT NULL
);
-- Table: stop_attributes
CREATE TABLE IF NOT EXISTS stop_attributes (
    stop_id varchar(255) NOT NULL,
    accessibility_id integer,
    cardinal_direction varchar(255),
    relative_position varchar(255),
    stop_city varchar(255) COLLATE NOCASE,
    PRIMARY KEY (stop_id)
);
-- Table: stop_time_updates
CREATE TABLE IF NOT EXISTS stop_time_updates (
    trip_id varchar(255),
    trip_start_time varchar(255),
    direction_id integer,
    route_id varchar(255),
    stop_id varchar(255),
    stop_sequence integer,
    arrival_delay integer,
    departure_delay integer,
    departure_timestamp varchar(255),
    arrival_timestamp varchar(255),
    schedule_relationship varchar(255),
    is_updated integer CHECK(
        is_updated >= 0
        AND is_updated <= 1
    ) NOT NULL DEFAULT 1
);
-- Table: stop_times
CREATE TABLE IF NOT EXISTS stop_times (
    trip_id varchar(255) NOT NULL,
    arrival_time varchar(255),
    arrival_timestamp integer,
    departure_time varchar(255),
    departure_timestamp integer,
    stop_id varchar(255) NOT NULL,
    stop_sequence integer NOT NULL,
    stop_headsign varchar(255) COLLATE NOCASE,
    pickup_type integer CHECK(
        pickup_type >= 0
        AND pickup_type <= 3
    ),
    drop_off_type integer CHECK(
        drop_off_type >= 0
        AND drop_off_type <= 3
    ),
    continuous_pickup integer CHECK(
        continuous_pickup >= 0
        AND continuous_pickup <= 3
    ),
    continuous_drop_off integer CHECK(
        continuous_drop_off >= 0
        AND continuous_drop_off <= 3
    ),
    shape_dist_traveled real,
    timepoint integer CHECK(
        timepoint >= 0
        AND timepoint <= 1
    ),
    PRIMARY KEY (trip_id, stop_sequence)
);
-- Table: stops
CREATE TABLE IF NOT EXISTS stops (
    stop_id varchar(255) NOT NULL,
    stop_code varchar(255),
    stop_name varchar(255) COLLATE NOCASE,
    tts_stop_name varchar(255) COLLATE NOCASE,
    stop_desc varchar(255) COLLATE NOCASE,
    stop_lat real CHECK(
        stop_lat >= -90
        AND stop_lat <= 90
    ),
    stop_lon real CHECK(
        stop_lon >= -180
        AND stop_lon <= 180
    ),
    zone_id varchar(255),
    stop_url varchar(2047),
    location_type integer CHECK(
        location_type >= 0
        AND location_type <= 4
    ),
    parent_station varchar(255),
    stop_timezone varchar(255),
    wheelchair_boarding integer CHECK(
        wheelchair_boarding >= 0
        AND wheelchair_boarding <= 2
    ),
    level_id varchar(255),
    platform_code varchar(255),
    PRIMARY KEY (stop_id)
);
-- Table: timetable_notes
CREATE TABLE IF NOT EXISTS timetable_notes (
    note_id varchar(255),
    symbol varchar(255),
    note varchar(2047) COLLATE NOCASE,
    PRIMARY KEY (note_id)
);
-- Table: timetable_notes_references
CREATE TABLE IF NOT EXISTS timetable_notes_references (
    note_id varchar(255),
    timetable_id varchar(255),
    route_id varchar(255),
    trip_id varchar(255),
    stop_id varchar(255),
    stop_sequence integer,
    show_on_stoptime integer CHECK(
        show_on_stoptime >= 0
        AND show_on_stoptime <= 1
    )
);
-- Table: timetable_pages
CREATE TABLE IF NOT EXISTS timetable_pages (
    timetable_page_id varchar(255),
    timetable_page_label varchar(255),
    filename varchar(255),
    PRIMARY KEY (timetable_page_id)
);
-- Table: timetable_stop_order
CREATE TABLE IF NOT EXISTS timetable_stop_order (
    id integer,
    timetable_id varchar(255),
    stop_id varchar(255),
    stop_sequence integer,
    PRIMARY KEY (id)
);
-- Table: timetables
CREATE TABLE IF NOT EXISTS timetables (
    id integer,
    timetable_id varchar(255),
    route_id varchar(255),
    direction_id integer CHECK(
        direction_id >= 0
        AND direction_id <= 1
    ),
    start_date integer,
    end_date integer,
    monday integer CHECK(
        monday >= 0
        AND monday <= 1
    ) NOT NULL,
    tuesday integer CHECK(
        tuesday >= 0
        AND tuesday <= 1
    ) NOT NULL,
    wednesday integer CHECK(
        wednesday >= 0
        AND wednesday <= 1
    ) NOT NULL,
    thursday integer CHECK(
        thursday >= 0
        AND thursday <= 1
    ) NOT NULL,
    friday integer CHECK(
        friday >= 0
        AND friday <= 1
    ) NOT NULL,
    saturday integer CHECK(
        saturday >= 0
        AND saturday <= 1
    ) NOT NULL,
    sunday integer CHECK(
        sunday >= 0
        AND sunday <= 1
    ) NOT NULL,
    start_time varchar(255),
    start_timestamp integer,
    end_time varchar(255),
    end_timestamp integer,
    timetable_label varchar(255) COLLATE NOCASE,
    service_notes varchar(255) COLLATE NOCASE,
    orientation varchar(255),
    timetable_page_id varchar(255),
    timetable_sequence integer,
    direction_name varchar(255),
    include_exceptions integer CHECK(
        include_exceptions >= 0
        AND include_exceptions <= 1
    ),
    show_trip_continuation integer CHECK(
        show_trip_continuation >= 0
        AND show_trip_continuation <= 1
    ),
    PRIMARY KEY (id)
);
-- Table: transfers
CREATE TABLE IF NOT EXISTS transfers (
    from_stop_id varchar(255),
    to_stop_id varchar(255),
    from_route_id varchar(255),
    to_route_id varchar(255),
    from_trip_id varchar(255),
    to_trip_id varchar(255),
    transfer_type integer CHECK(
        transfer_type >= 0
        AND transfer_type <= 5
    ),
    min_transfer_time integer,
    PRIMARY KEY (
        from_stop_id,
        to_stop_id,
        from_route_id,
        to_route_id,
        from_trip_id,
        to_trip_id
    )
);
-- Table: translations
CREATE TABLE IF NOT EXISTS translations (
    table_name varchar(255) NOT NULL,
    field_name varchar(255) NOT NULL,
    language varchar(255) NOT NULL,
    translation varchar(2047) NOT NULL,
    record_id varchar(255),
    record_sub_id varchar(255),
    field_value varchar(2047),
    PRIMARY KEY (
        table_name,
        field_name,
        language,
        record_id,
        record_sub_id,
        field_value
    )
);
-- Table: trip_capacity
CREATE TABLE IF NOT EXISTS trip_capacity (
    agency_id varchar(255),
    trip_id varchar(255),
    service_date integer,
    vehicle_description varchar(255),
    seated_capacity integer,
    standing_capacity integer,
    wheelchair_capacity integer,
    bike_capacity integer
);
-- Table: trip_updates
CREATE TABLE IF NOT EXISTS trip_updates (
    update_id varchar(255) NOT NULL,
    vehicle_id varchar(255),
    trip_id varchar(255),
    trip_start_time varchar(255),
    direction_id integer,
    route_id varchar(255),
    start_date varchar(255),
    timestamp varchar(255),
    schedule_relationship varchar(255),
    is_updated integer CHECK(
        is_updated >= 0
        AND is_updated <= 1
    ) NOT NULL DEFAULT 1,
    PRIMARY KEY (update_id)
);
-- Table: trips
CREATE TABLE IF NOT EXISTS trips (
    route_id varchar(255) NOT NULL,
    service_id varchar(255) NOT NULL,
    trip_id varchar(255) NOT NULL,
    trip_headsign varchar(255) COLLATE NOCASE,
    trip_short_name varchar(255) COLLATE NOCASE,
    direction_id integer CHECK(
        direction_id >= 0
        AND direction_id <= 1
    ),
    block_id varchar(255),
    shape_id varchar(255),
    wheelchair_accessible integer CHECK(
        wheelchair_accessible >= 0
        AND wheelchair_accessible <= 2
    ),
    bikes_allowed integer CHECK(
        bikes_allowed >= 0
        AND bikes_allowed <= 2
    ),
    PRIMARY KEY (trip_id)
);
-- Table: trips_dated_vehicle_journeys
CREATE TABLE IF NOT EXISTS trips_dated_vehicle_journeys (
    trip_id varchar(255) NOT NULL,
    operating_day_date varchar(255) NOT NULL,
    dated_vehicle_journey_gid varchar(255) NOT NULL,
    journey_number integer CHECK(
        journey_number >= 0
        AND journey_number <= 65535
    )
);
-- Table: vehicle_positions
CREATE TABLE IF NOT EXISTS vehicle_positions (
    update_id varchar(255) NOT NULL,
    bearing real,
    latitude real CHECK(
        latitude >= -90
        AND latitude <= 90
    ),
    longitude real CHECK(
        longitude >= -180
        AND longitude <= 180
    ),
    speed real,
    trip_id varchar(255),
    vehicle_id varchar(255),
    timestamp varchar(255),
    is_updated integer CHECK(
        is_updated >= 0
        AND is_updated <= 1
    ) NOT NULL DEFAULT 1,
    PRIMARY KEY (update_id)
);
-- Index: idx_board_alight_record_use
CREATE INDEX IF NOT EXISTS idx_board_alight_record_use ON board_alight (record_use);
-- Index: idx_board_alight_service_arrival_timestamp
CREATE INDEX IF NOT EXISTS idx_board_alight_service_arrival_timestamp ON board_alight (service_arrival_timestamp);
-- Index: idx_board_alight_service_date
CREATE INDEX IF NOT EXISTS idx_board_alight_service_date ON board_alight (service_date);
-- Index: idx_board_alight_service_departure_timestamp
CREATE INDEX IF NOT EXISTS idx_board_alight_service_departure_timestamp ON board_alight (service_departure_timestamp);
-- Index: idx_board_alight_stop_id
CREATE INDEX IF NOT EXISTS idx_board_alight_stop_id ON board_alight (stop_id);
-- Index: idx_board_alight_stop_sequence
CREATE INDEX IF NOT EXISTS idx_board_alight_stop_sequence ON board_alight (stop_sequence);
-- Index: idx_board_alight_trip_id
CREATE INDEX IF NOT EXISTS idx_board_alight_trip_id ON board_alight (trip_id);
-- Index: idx_calendar_dates_exception_type
CREATE INDEX IF NOT EXISTS idx_calendar_dates_exception_type ON calendar_dates (exception_type);
-- Index: idx_calendar_end_date
CREATE INDEX IF NOT EXISTS idx_calendar_end_date ON calendar (end_date);
-- Index: idx_calendar_start_date
CREATE INDEX IF NOT EXISTS idx_calendar_start_date ON calendar (start_date);
-- Index: idx_deadhead_times_arrival_timestamp
CREATE INDEX IF NOT EXISTS idx_deadhead_times_arrival_timestamp ON deadhead_times (arrival_timestamp);
-- Index: idx_deadhead_times_deadhead_id
CREATE INDEX IF NOT EXISTS idx_deadhead_times_deadhead_id ON deadhead_times (deadhead_id);
-- Index: idx_deadhead_times_departure_timestamp
CREATE INDEX IF NOT EXISTS idx_deadhead_times_departure_timestamp ON deadhead_times (departure_timestamp);
-- Index: idx_deadhead_times_location_sequence
CREATE INDEX IF NOT EXISTS idx_deadhead_times_location_sequence ON deadhead_times (location_sequence);
-- Index: idx_deadheads_block_id
CREATE INDEX IF NOT EXISTS idx_deadheads_block_id ON deadheads (block_id);
-- Index: idx_deadheads_from_deadhead_id
CREATE INDEX IF NOT EXISTS idx_deadheads_from_deadhead_id ON deadheads (from_deadhead_id);
-- Index: idx_deadheads_from_trip_id
CREATE INDEX IF NOT EXISTS idx_deadheads_from_trip_id ON deadheads (from_trip_id);
-- Index: idx_deadheads_shape_id
CREATE INDEX IF NOT EXISTS idx_deadheads_shape_id ON deadheads (shape_id);
-- Index: idx_deadheads_to_deadhead_id
CREATE INDEX IF NOT EXISTS idx_deadheads_to_deadhead_id ON deadheads (to_deadhead_id);
-- Index: idx_deadheads_to_trip_id
CREATE INDEX IF NOT EXISTS idx_deadheads_to_trip_id ON deadheads (to_trip_id);
-- Index: idx_ride_feed_info_gtfs_feed_date
CREATE INDEX IF NOT EXISTS idx_ride_feed_info_gtfs_feed_date ON ride_feed_info (gtfs_feed_date);
-- Index: idx_ride_feed_info_ride_end_date
CREATE INDEX IF NOT EXISTS idx_ride_feed_info_ride_end_date ON ride_feed_info (ride_end_date);
-- Index: idx_ride_feed_info_ride_start_date
CREATE INDEX IF NOT EXISTS idx_ride_feed_info_ride_start_date ON ride_feed_info (ride_start_date);
-- Index: idx_rider_trip_agency_id
CREATE INDEX IF NOT EXISTS idx_rider_trip_agency_id ON rider_trip (agency_id);
-- Index: idx_rider_trip_alighting_stop_id
CREATE INDEX IF NOT EXISTS idx_rider_trip_alighting_stop_id ON rider_trip (alighting_stop_id);
-- Index: idx_rider_trip_alighting_stop_sequence
CREATE INDEX IF NOT EXISTS idx_rider_trip_alighting_stop_sequence ON rider_trip (alighting_stop_sequence);
-- Index: idx_rider_trip_alighting_timestamp
CREATE INDEX IF NOT EXISTS idx_rider_trip_alighting_timestamp ON rider_trip (alighting_timestamp);
-- Index: idx_rider_trip_boarding_stop_id
CREATE INDEX IF NOT EXISTS idx_rider_trip_boarding_stop_id ON rider_trip (boarding_stop_id);
-- Index: idx_rider_trip_boarding_stop_sequence
CREATE INDEX IF NOT EXISTS idx_rider_trip_boarding_stop_sequence ON rider_trip (boarding_stop_sequence);
-- Index: idx_rider_trip_boarding_timestamp
CREATE INDEX IF NOT EXISTS idx_rider_trip_boarding_timestamp ON rider_trip (boarding_timestamp);
-- Index: idx_rider_trip_service_date
CREATE INDEX IF NOT EXISTS idx_rider_trip_service_date ON rider_trip (service_date);
-- Index: idx_rider_trip_trip_id
CREATE INDEX IF NOT EXISTS idx_rider_trip_trip_id ON rider_trip (trip_id);
-- Index: idx_ridership_agency_id
CREATE INDEX IF NOT EXISTS idx_ridership_agency_id ON ridership (agency_id);
-- Index: idx_ridership_direction_id
CREATE INDEX IF NOT EXISTS idx_ridership_direction_id ON ridership (direction_id);
-- Index: idx_ridership_ridership_end_date
CREATE INDEX IF NOT EXISTS idx_ridership_ridership_end_date ON ridership (ridership_end_date);
-- Index: idx_ridership_ridership_end_timestamp
CREATE INDEX IF NOT EXISTS idx_ridership_ridership_end_timestamp ON ridership (ridership_end_timestamp);
-- Index: idx_ridership_ridership_start_date
CREATE INDEX IF NOT EXISTS idx_ridership_ridership_start_date ON ridership (ridership_start_date);
-- Index: idx_ridership_ridership_start_timestamp
CREATE INDEX IF NOT EXISTS idx_ridership_ridership_start_timestamp ON ridership (ridership_start_timestamp);
-- Index: idx_ridership_route_id
CREATE INDEX IF NOT EXISTS idx_ridership_route_id ON ridership (route_id);
-- Index: idx_ridership_service_id
CREATE INDEX IF NOT EXISTS idx_ridership_service_id ON ridership (service_id);
-- Index: idx_run_event_event_from_location_type
CREATE INDEX IF NOT EXISTS idx_run_event_event_from_location_type ON run_event (event_from_location_type);
-- Index: idx_run_event_event_to_location_type
CREATE INDEX IF NOT EXISTS idx_run_event_event_to_location_type ON run_event (event_to_location_type);
-- Index: idx_run_event_event_type
CREATE INDEX IF NOT EXISTS idx_run_event_event_type ON run_event (event_type);
-- Index: idx_runs_pieces_end_trip_id
CREATE INDEX IF NOT EXISTS idx_runs_pieces_end_trip_id ON runs_pieces (end_trip_id);
-- Index: idx_runs_pieces_end_type
CREATE INDEX IF NOT EXISTS idx_runs_pieces_end_type ON runs_pieces (end_type);
-- Index: idx_runs_pieces_start_trip_id
CREATE INDEX IF NOT EXISTS idx_runs_pieces_start_trip_id ON runs_pieces (start_trip_id);
-- Index: idx_runs_pieces_start_type
CREATE INDEX IF NOT EXISTS idx_runs_pieces_start_type ON runs_pieces (start_type);
-- Index: idx_service_alert_targets_route_id
CREATE INDEX IF NOT EXISTS idx_service_alert_targets_route_id ON service_alert_targets (route_id);
-- Index: idx_service_alert_targets_stop_id
CREATE INDEX IF NOT EXISTS idx_service_alert_targets_stop_id ON service_alert_targets (stop_id);
-- Index: idx_service_alerts_id
CREATE INDEX IF NOT EXISTS idx_service_alerts_id ON service_alerts (id);
-- Index: idx_stop_time_updates_route_id
CREATE INDEX IF NOT EXISTS idx_stop_time_updates_route_id ON stop_time_updates (route_id);
-- Index: idx_stop_time_updates_stop_id
CREATE INDEX IF NOT EXISTS idx_stop_time_updates_stop_id ON stop_time_updates (stop_id);
-- Index: idx_stop_time_updates_trip_id
CREATE INDEX IF NOT EXISTS idx_stop_time_updates_trip_id ON stop_time_updates (trip_id);
-- Index: idx_stop_times_arrival_timestamp
CREATE INDEX IF NOT EXISTS idx_stop_times_arrival_timestamp ON stop_times (arrival_timestamp);
-- Index: idx_stop_times_departure_timestamp
CREATE INDEX IF NOT EXISTS idx_stop_times_departure_timestamp ON stop_times (departure_timestamp);
-- Index: idx_stop_times_stop_id
CREATE INDEX IF NOT EXISTS idx_stop_times_stop_id ON stop_times (stop_id);
-- Index: idx_stops_parent_station
CREATE INDEX IF NOT EXISTS idx_stops_parent_station ON stops (parent_station);
-- Index: idx_timetable_notes_references_route_id
CREATE INDEX IF NOT EXISTS idx_timetable_notes_references_route_id ON timetable_notes_references (route_id);
-- Index: idx_timetable_notes_references_stop_id
CREATE INDEX IF NOT EXISTS idx_timetable_notes_references_stop_id ON timetable_notes_references (stop_id);
-- Index: idx_timetable_notes_references_stop_sequence
CREATE INDEX IF NOT EXISTS idx_timetable_notes_references_stop_sequence ON timetable_notes_references (stop_sequence);
-- Index: idx_timetable_notes_references_timetable_id
CREATE INDEX IF NOT EXISTS idx_timetable_notes_references_timetable_id ON timetable_notes_references (timetable_id);
-- Index: idx_timetable_notes_references_trip_id
CREATE INDEX IF NOT EXISTS idx_timetable_notes_references_trip_id ON timetable_notes_references (trip_id);
-- Index: idx_timetable_stop_order_stop_sequence
CREATE INDEX IF NOT EXISTS idx_timetable_stop_order_stop_sequence ON timetable_stop_order (stop_sequence);
-- Index: idx_timetable_stop_order_timetable_id
CREATE INDEX IF NOT EXISTS idx_timetable_stop_order_timetable_id ON timetable_stop_order (timetable_id);
-- Index: idx_timetables_timetable_sequence
CREATE INDEX IF NOT EXISTS idx_timetables_timetable_sequence ON timetables (timetable_sequence);
-- Index: idx_trip_capacity_agency_id
CREATE INDEX IF NOT EXISTS idx_trip_capacity_agency_id ON trip_capacity (agency_id);
-- Index: idx_trip_capacity_service_date
CREATE INDEX IF NOT EXISTS idx_trip_capacity_service_date ON trip_capacity (service_date);
-- Index: idx_trip_capacity_trip_id
CREATE INDEX IF NOT EXISTS idx_trip_capacity_trip_id ON trip_capacity (trip_id);
-- Index: idx_trip_updates_route_id
CREATE INDEX IF NOT EXISTS idx_trip_updates_route_id ON trip_updates (route_id);
-- Index: idx_trip_updates_trip_id
CREATE INDEX IF NOT EXISTS idx_trip_updates_trip_id ON trip_updates (trip_id);
-- Index: idx_trip_updates_update_id
CREATE INDEX IF NOT EXISTS idx_trip_updates_update_id ON trip_updates (update_id);
-- Index: idx_trip_updates_vehicle_id
CREATE INDEX IF NOT EXISTS idx_trip_updates_vehicle_id ON trip_updates (vehicle_id);
-- Index: idx_trips_block_id
CREATE INDEX IF NOT EXISTS idx_trips_block_id ON trips (block_id);
-- Index: idx_trips_dated_vehicle_journeys_journey_number
CREATE INDEX IF NOT EXISTS idx_trips_dated_vehicle_journeys_journey_number ON trips_dated_vehicle_journeys (journey_number);
-- Index: idx_trips_dated_vehicle_journeys_operating_day_date
CREATE INDEX IF NOT EXISTS idx_trips_dated_vehicle_journeys_operating_day_date ON trips_dated_vehicle_journeys (operating_day_date);
-- Index: idx_trips_dated_vehicle_journeys_trip_id
CREATE INDEX IF NOT EXISTS idx_trips_dated_vehicle_journeys_trip_id ON trips_dated_vehicle_journeys (trip_id);
-- Index: idx_trips_direction_id
CREATE INDEX IF NOT EXISTS idx_trips_direction_id ON trips (direction_id);
-- Index: idx_trips_route_id
CREATE INDEX IF NOT EXISTS idx_trips_route_id ON trips (route_id);
-- Index: idx_trips_service_id
CREATE INDEX IF NOT EXISTS idx_trips_service_id ON trips (service_id);
-- Index: idx_trips_shape_id
CREATE INDEX IF NOT EXISTS idx_trips_shape_id ON trips (shape_id);
-- Index: idx_vehicle_positions_trip_id
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_trip_id ON vehicle_positions (trip_id);
-- Index: idx_vehicle_positions_update_id
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_update_id ON vehicle_positions (update_id);
-- Index: idx_vehicle_positions_vehicle_id
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_id ON vehicle_positions (vehicle_id);
COMMIT TRANSACTION;
PRAGMA foreign_keys = on;