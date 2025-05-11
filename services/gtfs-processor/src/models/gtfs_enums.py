from enum import IntEnum

# --- GTFS Static Enums ---


class LocationType(IntEnum):
    """
    Type of a location in stops.txt.
    From GTFS Static Reference (stops.txt: location_type).
    Source: https://gtfs.org/documentation/schedule/reference/#stopstxt
    """

    STOP = 0  # Stop or Platform. A location where passengers board or disembark.
    STATION = (
        1  # Station. A physical structure or area that contains one or more platforms.
    )
    ENTRANCE_EXIT = (
        2  # Entrance/Exit. A location where passengers can enter or exit a station.
    )
    GENERIC_NODE = 3  # Generic Node. A location within a station, not matching any other location_type.
    BOARDING_AREA = 4  # Boarding Area. A specific location on a platform.


class WheelchairBoarding(IntEnum):
    """
    Wheelchair accessibility for a stop or station entrance in stops.txt.
    From GTFS Static Reference (stops.txt: wheelchair_boarding).
    Source: https://gtfs.org/documentation/schedule/reference/#stopstxt
    """

    NO_INFO = 0  # No accessibility information or inherits from parent.
    ACCESSIBLE = 1  # Some vehicles/paths are wheelchair accessible.
    NOT_ACCESSIBLE = 2  # Wheelchair boarding/path is not possible.


class RouteType(IntEnum):
    """
    Type of transportation used on a route in routes.txt.
    From GTFS Static Reference (routes.txt: route_type).
    Source: https://gtfs.org/documentation/schedule/reference/#routestxt
    """

    TRAM = 0  # Tram, Streetcar, Light rail.
    SUBWAY = 1  # Subway, Metro.
    RAIL = 2  # Rail. Used for intercity or long-distance travel.
    BUS = 3  # Bus.
    FERRY = 4  # Ferry.
    CABLE_TRAM = 5  # Cable tram. (e.g., San Francisco cable car)
    AERIAL_LIFT = 6  # Aerial lift, suspended cable car. (e.g., gondola, aerial tramway)
    FUNICULAR = 7  # Funicular. Rail system for steep inclines.
    TROLLEYBUS = 11  # Trolleybus. Electric buses using overhead wires.
    MONORAIL = 12  # Monorail.


class ContinuousPickupDropOff(IntEnum):
    """
    Indicates whether continuous pickup or drop-off is available.
    Used in routes.txt (continuous_pickup, continuous_drop_off) and
    stop_times.txt (continuous_pickup, continuous_drop_off).
    From GTFS Static Reference.
    Source: https://gtfs.org/documentation/schedule/reference/#routestxt
            https://gtfs.org/documentation/schedule/reference/#stop_timestxt
    """

    CONTINUOUS = 0  # Continuous stopping pickup/drop-off.
    NONE = 1  # No continuous stopping pickup/drop-off (default if empty).
    PHONE_AGENCY = 2  # Must phone agency to arrange.
    COORDINATE_WITH_DRIVER = 3  # Must coordinate with driver to arrange.


class DirectionId(IntEnum):
    """
    Indicates the direction of travel for a trip in trips.txt.
    From GTFS Static Reference (trips.txt: direction_id).
    Source: https://gtfs.org/documentation/schedule/reference/#tripstxt
    """

    DIRECTION_0 = 0  # Travel in one direction (e.g., outbound).
    DIRECTION_1 = 1  # Travel in the opposite direction (e.g., inbound).


class TripWheelchairAccessibility(IntEnum):
    """
    Indicates wheelchair accessibility for a trip in trips.txt.
    From GTFS Static Reference (trips.txt: wheelchair_accessible).
    Source: https://gtfs.org/documentation/schedule/reference/#tripstxt
    """

    NO_INFO = 0  # No accessibility information for the trip (default if empty).
    ACCESSIBLE = 1  # Vehicle can accommodate at least one rider in a wheelchair.
    NOT_ACCESSIBLE = 2  # No riders in wheelchairs can be accommodated.


class BikesAllowed(IntEnum):
    """
    Indicates whether bikes are allowed on a trip in trips.txt.
    From GTFS Static Reference (trips.txt: bikes_allowed).
    Source: https://gtfs.org/documentation/schedule/reference/#tripstxt
    """

    NO_INFO = 0  # No bike information for the trip (default if empty).
    ALLOWED = 1  # Vehicle can accommodate at least one bicycle.
    NOT_ALLOWED = 2  # No bicycles are allowed on this trip.


class PickupDropOffType(IntEnum):
    """
    Indicates pickup or drop-off method in stop_times.txt.
    Used for stop_times.txt (pickup_type, drop_off_type).
    From GTFS Static Reference.
    Source: https://gtfs.org/documentation/schedule/reference/#stop_timestxt
    """

    REGULARLY_SCHEDULED = 0  # Regularly scheduled (default if empty).
    NO_SERVICE_AVAILABLE = 1  # No pickup/drop-off available.
    PHONE_AGENCY = 2  # Must phone agency to arrange.
    COORDINATE_WITH_DRIVER = 3  # Must coordinate with driver to arrange.


class Timepoint(IntEnum):
    """
    Indicates if arrival/departure times are exact or approximate in stop_times.txt.
    From GTFS Static Reference (stop_times.txt: timepoint).
    Source: https://gtfs.org/documentation/schedule/reference/#stop_timestxt
    """

    APPROXIMATE = 0  # Times are considered approximate.
    EXACT = 1  # Times are considered exact.


class CalendarAvailability(IntEnum):
    """
    Indicates if a service is available on a particular day in calendar.txt.
    From GTFS Static Reference (calendar.txt: monday-sunday fields).
    Source: https://gtfs.org/documentation/schedule/reference/#calendartxt
    """

    NOT_AVAILABLE = 0  # Service is not available.
    AVAILABLE = 1  # Service is available.


class CalendarExceptionType(IntEnum):
    """
    Indicates whether service is added or removed on a specific date in calendar_dates.txt.
    From GTFS Static Reference (calendar_dates.txt: exception_type).
    Source: https://gtfs.org/documentation/schedule/reference/#calendar_datestxt
    """

    ADDED = 1  # Service has been added for the specified date.
    REMOVED = 2  # Service has been removed for the specified date.


class FarePaymentMethod(IntEnum):
    """
    Indicates when a fare must be paid in fare_attributes.txt.
    From GTFS Static Reference (fare_attributes.txt: payment_method).
    Source: https://gtfs.org/documentation/schedule/reference/#fare_attributestxt
    """

    ON_BOARD = 0  # Fare is paid on board.
    BEFORE_BOARDING = 1  # Fare must be paid before boarding.


class FareTransferCount(IntEnum):
    """
    Indicates the number of transfers permitted on a fare in fare_attributes.txt.
    Note: Empty value means unlimited transfers, not represented here.
    From GTFS Static Reference (fare_attributes.txt: transfers).
    Source: https://gtfs.org/documentation/schedule/reference/#fare_attributestxt
    """

    NO_TRANSFERS = 0  # No transfers permitted on this fare.
    ONE_TRANSFER = 1  # Riders may transfer once.
    TWO_TRANSFERS = 2  # Riders may transfer twice.


class RiderCategoryDefault(IntEnum):
    """
    Specifies if a rider category is the default in rider_categories.txt.
    From GTFS Static Reference (rider_categories.txt: is_default_fare_category).
    Source: https://gtfs.org/documentation/schedule/reference/#rider_categoriestxt
    """

    NOT_DEFAULT = 0  # Category is not considered the default (default if empty).
    IS_DEFAULT = 1  # Category is considered the default one.


class FareMediaType(IntEnum):
    """
    The type of fare media in fare_media.txt.
    From GTFS Static Reference (fare_media.txt: fare_media_type).
    Source: https://gtfs.org/documentation/schedule/reference/#fare_mediatxt
    """

    NONE = 0  # No fare media involved (e.g., cash to driver).
    PAPER_TICKET = 1  # Physical paper ticket.
    TRANSIT_CARD = 2  # Physical transit card.
    CEMV = 3  # Contactless Europay, Mastercard and Visa.
    MOBILE_APP = 4  # Mobile app.


class FareTransferDurationLimitType(IntEnum):
    """
    Defines the relative start and end of a transfer duration limit in fare_transfer_rules.txt.
    From GTFS Static Reference (fare_transfer_rules.txt: duration_limit_type).
    Source: https://gtfs.org/documentation/schedule/reference/#fare_transfer_rulestxt
    """

    DEPARTURE_TO_ARRIVAL = 0  # Between departure (current leg) and arrival (next leg).
    DEPARTURE_TO_DEPARTURE = (
        1  # Between departure (current leg) and departure (next leg).
    )
    ARRIVAL_TO_DEPARTURE = 2  # Between arrival (current leg) and departure (next leg).
    ARRIVAL_TO_ARRIVAL = 3  # Between arrival (current leg) and arrival (next leg).


class FareTransferType(IntEnum):
    """
    Indicates the cost processing method for transfers in fare_transfer_rules.txt.
    From GTFS Static Reference (fare_transfer_rules.txt: fare_transfer_type).
    Source: https://gtfs.org/documentation/schedule/reference/#fare_transfer_rulestxt
    """

    FROM_LEG_PLUS_TRANSFER_COST = 0  # From-leg fare + transfer fare product (A + AB).
    FROM_LEG_PLUS_TRANSFER_PLUS_TO_LEG = (
        1  # From-leg fare + transfer fare + to-leg fare (A + AB + B).
    )
    TRANSFER_COST_ONLY = 2  # Only transfer fare product (AB).


class PathwayMode(IntEnum):
    """
    Type of pathway in pathways.txt.
    From GTFS Static Reference (pathways.txt: pathway_mode).
    Source: https://gtfs.org/documentation/schedule/reference/#pathwaystxt
    """

    WALKWAY = 1
    STAIRS = 2
    MOVING_SIDEWALK = 3  # Moving sidewalk/travelator.
    ESCALATOR = 4
    ELEVATOR = 5
    FARE_GATE = 6  # Fare gate or payment gate.
    EXIT_GATE = 7  # Pathway exiting a paid area.


class PathwayBidirectional(IntEnum):
    """
    Indicates if a pathway is bidirectional in pathways.txt.
    From GTFS Static Reference (pathways.txt: is_bidirectional).
    Source: https://gtfs.org/documentation/schedule/reference/#pathwaystxt
    """

    UNIDIRECTIONAL = 0  # Pathway can only be used from from_stop_id to to_stop_id.
    BIDIRECTIONAL = 1  # Pathway can be used in both directions.


class BookingType(IntEnum):
    """
    Indicates how far in advance booking can be made in booking_rules.txt.
    From GTFS Static Reference (booking_rules.txt: booking_type).
    Source: https://gtfs.org/documentation/schedule/reference/#booking_rulestxt
    """

    REAL_TIME = 0  # Real time booking.
    SAME_DAY_ADVANCE = 1  # Up to same-day booking with advance notice.
    PRIOR_DAYS_ADVANCE = 2  # Up to prior day(s) booking.


class AttributionRole(IntEnum):
    """
    Indicates the role of an organization in attributions.txt.
    From GTFS Static Reference (attributions.txt: is_producer, is_operator, is_authority).
    Source: https://gtfs.org/documentation/schedule/reference/#attributionstxt
    """

    NO_ROLE = 0  # Organization does not have this role (default if empty).
    HAS_ROLE = 1  # Organization does have this role.


# --- GTFS Realtime Enums ---


class Incrementality(IntEnum):
    """
    Determines whether the current fetch is incremental in FeedHeader.
    From GTFS Realtime Reference (FeedHeader: incrementality).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-incrementality
    """

    FULL_DATASET = (
        0  # This feed update will overwrite all preceding realtime information.
    )
    DIFFERENTIAL = 1  # This mode is unsupported and behavior is unspecified.


class TripDescriptorScheduleRelationship(IntEnum):
    """
    The relation between a trip and the static schedule in TripDescriptor.
    Values align with the GTFS Realtime .proto file.
    From GTFS Realtime Reference (TripDescriptor: schedule_relationship).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-schedulerelationship_1
            (and gtfs-realtime.proto for numeric values)
    """

    SCHEDULED = 0  # Trip is running in accordance with GTFS schedule.
    ADDED = 1  # An extra trip added to the schedule.
    UNSCHEDULED = 2  # A trip running without a GTFS schedule (e.g., frequency-based exact_times=0).
    CANCELED = 3  # A trip that existed in the schedule but was removed.
    # REPLACEMENT = 4 # Deprecated in proto, not in reference.md; prefer DUPLICATED.
    DUPLICATED = 5  # A new trip that is a copy of an existing trip but with a new service date/time.
    DELETED = 6  # A trip that existed but was removed and should not be shown to users.


class StopTimeUpdateScheduleRelationship(IntEnum):
    """
    The relation between a StopTime and the static schedule in StopTimeUpdate.
    From GTFS Realtime Reference (StopTimeUpdate: schedule_relationship).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-schedulerelationship
    """

    SCHEDULED = (
        0  # The vehicle is proceeding according to its static schedule of stops.
    )
    SKIPPED = 1  # The stop is skipped.
    NO_DATA = 2  # No data is given for this stop (no realtime timing information).
    UNSCHEDULED = 3  # The vehicle is operating a frequency-based trip (exact_times=0). Experimental.


class VehicleWheelchairAccessible(IntEnum):
    """
    Wheelchair accessibility for a vehicle in VehicleDescriptor.
    From GTFS Realtime Reference (VehicleDescriptor: wheelchair_accessible).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-wheelchairaccessible
    """

    NO_VALUE = (
        0  # Trip doesn't have information about wheelchair accessibility (default).
    )
    UNKNOWN = 1  # Trip has no accessibility value present, overwrites static GTFS.
    WHEELCHAIR_ACCESSIBLE = 2  # Trip is wheelchair accessible, overwrites static GTFS.
    WHEELCHAIR_INACCESSIBLE = (
        3  # Trip is not wheelchair accessible, overwrites static GTFS.
    )


class OccupancyStatus(IntEnum):
    """
    Describes the passenger occupancy level for a vehicle or carriage.
    Values align with GTFS Realtime specification (0-8).
    From GTFS Realtime Reference (VehiclePosition: occupancy_status).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-occupancystatus
    """

    EMPTY = 0  # The vehicle or carriage is considered empty.
    MANY_SEATS_AVAILABLE = 1  # Many seats are available.
    FEW_SEATS_AVAILABLE = 2  # Few seats are available.
    STANDING_ROOM_ONLY = 3  # Standing room only is available.
    CRUSHED_STANDING_ROOM_ONLY = (
        4  # Crushed standing room only is available (limited space).
    )
    FULL = 5  # The vehicle or carriage is full.
    NOT_ACCEPTING_PASSENGERS = (
        6  # The vehicle or carriage is not currently accepting passengers.
    )
    NO_DATA_AVAILABLE = 7  # No occupancy data is available for the vehicle/carriage.
    NOT_BOARDABLE = (
        8  # The vehicle or carriage is not boardable (e.g. engine, maintenance).
    )


class VehicleStopStatus(IntEnum):
    """
    The exact status of the vehicle with respect to the current stop in VehiclePosition.
    From GTFS Realtime Reference (VehiclePosition: current_status).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-vehiclestopstatus
    """

    INCOMING_AT = 0  # The vehicle is just about to arrive at the stop.
    STOPPED_AT = 1  # The vehicle is standing at the stop.
    IN_TRANSIT_TO = 2  # The vehicle has departed the previous stop and is in transit.


class CongestionLevel(IntEnum):
    """
    Congestion level affecting a vehicle in VehiclePosition.
    From GTFS Realtime Reference (VehiclePosition: congestion_level).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-congestionlevel
    """

    UNKNOWN_CONGESTION_LEVEL = 0
    RUNNING_SMOOTHLY = 1
    STOP_AND_GO = 2
    CONGESTION = 3
    SEVERE_CONGESTION = 4


class AlertCause(IntEnum):
    """
    Cause of an alert in Alert message.
    From GTFS Realtime Reference (Alert: cause).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-cause
    """

    UNKNOWN_CAUSE = 1  # Cause is unknown. (Proto values start from 1 for Cause/Effect)
    OTHER_CAUSE = 2  # Cause is not specified by other values.
    TECHNICAL_PROBLEM = 3
    STRIKE = 4  # Public transit agency strike.
    DEMONSTRATION = 5  # Public demonstration.
    ACCIDENT = 6
    HOLIDAY = 7
    WEATHER = 8
    MAINTENANCE = 9
    CONSTRUCTION = 10
    POLICE_ACTIVITY = 11
    MEDICAL_EMERGENCY = 12
    # Note: The reference doc doesn't assign numbers. Assuming 0-indexed based on order
    # unless proto explicitly states otherwise. For Cause/Effect, proto typically uses 1-based.


class AlertEffect(IntEnum):
    """
    Effect of an alert in Alert message.
    From GTFS Realtime Reference (Alert: effect).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-effect
    """

    NO_SERVICE = 1
    REDUCED_SERVICE = 2
    SIGNIFICANT_DELAYS = 3  # Delays are significant enough to impact passenger travel.
    DETOUR = 4
    ADDITIONAL_SERVICE = 5  # Service has been increased.
    MODIFIED_SERVICE = 6  # Service has been modified.
    OTHER_EFFECT = 7
    UNKNOWN_EFFECT = 8
    STOP_MOVED = 9
    NO_EFFECT = 10  # Alert has no effect on operation. Experimental.
    ACCESSIBILITY_ISSUE = 11  # Alert affects accessibility. Experimental.


class AlertSeverityLevel(IntEnum):
    """
    Severity of an alert in Alert message.
    From GTFS Realtime Reference (Alert: severity_level).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-severitylevel
    """

    UNKNOWN_SEVERITY = 1  # Severity is unknown.
    INFO = 2  # Informational alert.
    WARNING = 3  # Warning alert.
    SEVERE = 4  # Severe alert.


class DynamicStopWheelchairBoarding(IntEnum):
    """
    Wheelchair boarding information for a dynamically added Stop.
    From GTFS Realtime Reference (Stop: wheelchair_boarding).
    Source: https://gtfs.org/documentation/realtime/reference/#enum-wheelchairboarding
    """

    UNKNOWN = 0  # No accessibility information for the stop.
    AVAILABLE = (
        1  # Some vehicles at this stop can be boarded by a rider in a wheelchair.
    )
    NOT_AVAILABLE = 2  # Wheelchair boarding is not possible at this stop.
