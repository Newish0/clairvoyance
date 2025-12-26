from typing import Any, Optional
import datetime

from geoalchemy2.types import Geometry
from sqlalchemy import Column, DateTime, Double, Enum, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

class Agencies(SQLModel, table=True):
    __table_args__ = (
        PrimaryKeyConstraint('id', name='agencies_pkey'),
        {'schema': 'transit'}
    )

    id: str = Field(sa_column=Column('id', Text, primary_key=True))
    agency_sid: str = Field(sa_column=Column('agency_sid', Text, nullable=False))
    name: str = Field(sa_column=Column('name', Text, nullable=False))
    url: str = Field(sa_column=Column('url', Text, nullable=False))
    timezone: str = Field(sa_column=Column('timezone', Text, nullable=False))
    lang: Optional[str] = Field(default=None, sa_column=Column('lang', String(10)))
    phone: Optional[str] = Field(default=None, sa_column=Column('phone', Text))
    fare_url: Optional[str] = Field(default=None, sa_column=Column('fare_url', Text))
    email: Optional[str] = Field(default=None, sa_column=Column('email', Text))

    alerts: list['Alerts'] = Relationship(back_populates='agency')
    calendar_dates: list['CalendarDates'] = Relationship(back_populates='agency')
    feed_info: list['FeedInfo'] = Relationship(back_populates='agency')
    routes: list['Routes'] = Relationship(back_populates='agency')
    shapes: list['Shapes'] = Relationship(back_populates='agency')
    stops: list['Stops'] = Relationship(back_populates='agency')
    vehicles: list['Vehicles'] = Relationship(back_populates='agency')
    trips: list['Trips'] = Relationship(back_populates='agency')
    stop_times: list['StopTimes'] = Relationship(back_populates='agency')
    trip_instances: list['TripInstances'] = Relationship(back_populates='agency')


class Alerts(SQLModel, table=True):
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='alerts_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('id', name='alerts_pkey'),
        UniqueConstraint('content_hash', name='alerts_content_hash_unique'),
        Index('idx_alerts_active_periods_gin', 'active_periods'),
        Index('idx_alerts_informed_entities_gin', 'informed_entities'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    agency_id: str = Field(sa_column=Column('agency_id', Text, nullable=False))
    content_hash: str = Field(sa_column=Column('content_hash', Text, nullable=False))
    header_text: dict = Field(sa_column=Column('header_text', JSONB, nullable=False))
    description_text: dict = Field(sa_column=Column('description_text', JSONB, nullable=False))
    cause: Optional[str] = Field(default=None, sa_column=Column('cause', Enum('UNKNOWN_CAUSE', 'OTHER_CAUSE', 'TECHNICAL_PROBLEM', 'STRIKE', 'DEMONSTRATION', 'ACCIDENT', 'HOLIDAY', 'WEATHER', 'MAINTENANCE', 'CONSTRUCTION', 'POLICE_ACTIVITY', 'MEDICAL_EMERGENCY', name='alert_cause'), server_default=text("'UNKNOWN_CAUSE'::alert_cause")))
    effect: Optional[str] = Field(default=None, sa_column=Column('effect', Enum('NO_SERVICE', 'REDUCED_SERVICE', 'SIGNIFICANT_DELAYS', 'DETOUR', 'ADDITIONAL_SERVICE', 'MODIFIED_SERVICE', 'OTHER_EFFECT', 'UNKNOWN_EFFECT', 'STOP_MOVED', 'NO_EFFECT', 'ACCESSIBILITY_ISSUE', name='alert_effect'), server_default=text("'UNKNOWN_EFFECT'::alert_effect")))
    severity: Optional[str] = Field(default=None, sa_column=Column('severity', Enum('UNKNOWN_SEVERITY', 'INFO', 'WARNING', 'SEVERE', name='alert_severity'), server_default=text("'UNKNOWN_SEVERITY'::alert_severity")))
    url: Optional[dict] = Field(default=None, sa_column=Column('url', JSONB))
    active_periods: Optional[dict] = Field(default=None, sa_column=Column('active_periods', JSONB))
    informed_entities: Optional[dict] = Field(default=None, sa_column=Column('informed_entities', JSONB))
    last_seen: Optional[datetime.datetime] = Field(default=None, sa_column=Column('last_seen', DateTime(True), server_default=text('now()')))

    agency: Optional['Agencies'] = Relationship(back_populates='alerts')


class CalendarDates(SQLModel, table=True):
    __tablename__ = 'calendar_dates'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='calendar_dates_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('agency_id', 'service_sid', 'date', name='calendar_dates_agency_id_service_sid_date_pk'),
        {'schema': 'transit'}
    )

    agency_id: str = Field(sa_column=Column('agency_id', Text, primary_key=True))
    service_sid: str = Field(sa_column=Column('service_sid', Text, primary_key=True))
    date: str = Field(sa_column=Column('date', String(8), primary_key=True))
    exception_type: str = Field(sa_column=Column('exception_type', Enum('ADDED', 'REMOVED', name='calendar_exception_type'), nullable=False))

    agency: Optional['Agencies'] = Relationship(back_populates='calendar_dates')


class FeedInfo(SQLModel, table=True):
    __tablename__ = 'feed_info'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='feed_info_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('hash', name='uq_feed_info_feed_hash'),
        Index('idx_feed_info_agency_id', 'agency_id'),
        {'schema': 'transit'}
    )

    hash: str = Field(sa_column=Column('hash', Text, primary_key=True))
    agency_id: str = Field(sa_column=Column('agency_id', Text, nullable=False))
    publisher_name: Optional[str] = Field(default=None, sa_column=Column('publisher_name', Text))
    publisher_url: Optional[str] = Field(default=None, sa_column=Column('publisher_url', Text))
    lang: Optional[str] = Field(default=None, sa_column=Column('lang', String(10)))
    version: Optional[str] = Field(default=None, sa_column=Column('version', Text))
    start_date: Optional[str] = Field(default=None, sa_column=Column('start_date', String(8)))
    end_date: Optional[str] = Field(default=None, sa_column=Column('end_date', String(8)))

    agency: Optional['Agencies'] = Relationship(back_populates='feed_info')


class Routes(SQLModel, table=True):
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='routes_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('id', name='routes_pkey'),
        UniqueConstraint('agency_id', 'route_sid', name='uq_routes_agency_route_sid'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    agency_id: str = Field(sa_column=Column('agency_id', Text, nullable=False))
    route_sid: str = Field(sa_column=Column('route_sid', Text, nullable=False))
    type: str = Field(sa_column=Column('type', Enum('TRAM', 'SUBWAY', 'RAIL', 'BUS', 'FERRY', 'CABLE_TRAM', 'AERIAL_LIFT', 'FUNICULAR', 'TROLLEYBUS', 'MONORAIL', name='route_type'), nullable=False))
    short_name: Optional[str] = Field(default=None, sa_column=Column('short_name', Text))
    long_name: Optional[str] = Field(default=None, sa_column=Column('long_name', Text))
    color: Optional[str] = Field(default=None, sa_column=Column('color', String(6)))
    text_color: Optional[str] = Field(default=None, sa_column=Column('text_color', String(6)))

    agency: Optional['Agencies'] = Relationship(back_populates='routes')
    trips: list['Trips'] = Relationship(back_populates='route')
    trip_instances: list['TripInstances'] = Relationship(back_populates='route')


class Shapes(SQLModel, table=True):
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='shapes_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('id', name='shapes_pkey'),
        Index('idx_shapes_path_gist', 'path'),
        Index('idx_shapes_shape_sid', 'shape_sid'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    agency_id: str = Field(sa_column=Column('agency_id', Text, nullable=False))
    shape_sid: str = Field(sa_column=Column('shape_sid', Text, nullable=False))
    path: Any = Field(sa_column=Column('path', Geometry('POINT', dimension=2, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False))
    distances_traveled: Optional[dict] = Field(default=None, sa_column=Column('distances_traveled', JSONB))

    agency: Optional['Agencies'] = Relationship(back_populates='shapes')
    trips: list['Trips'] = Relationship(back_populates='shape')
    trip_instances: list['TripInstances'] = Relationship(back_populates='shape')


class Stops(SQLModel, table=True):
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='stops_agency_id_agencies_id_fk'),
        ForeignKeyConstraint(['parent_station_id'], ['transit.stops.id'], name='stops_parent_station_id_stops_id_fk'),
        PrimaryKeyConstraint('id', name='stops_pkey'),
        Index('idx_stops_agency_stop_sid', 'agency_id', 'stop_sid'),
        Index('idx_stops_location_gist', 'location'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    stop_sid: str = Field(sa_column=Column('stop_sid', Text, nullable=False))
    agency_id: Optional[str] = Field(default=None, sa_column=Column('agency_id', Text))
    code: Optional[str] = Field(default=None, sa_column=Column('code', Text))
    name: Optional[str] = Field(default=None, sa_column=Column('name', Text))
    description: Optional[str] = Field(default=None, sa_column=Column('description', Text))
    location: Optional[Any] = Field(default=None, sa_column=Column('location', Geometry('POINT', dimension=2, from_text='ST_GeomFromEWKT', name='geometry')))
    zone_id: Optional[str] = Field(default=None, sa_column=Column('zone_id', Text))
    url: Optional[str] = Field(default=None, sa_column=Column('url', Text))
    location_type: Optional[str] = Field(default=None, sa_column=Column('location_type', Enum('STOP_OR_PLATFORM', 'STATION', 'ENTRANCE_EXIT', 'GENERIC_NODE', 'BOARDING_AREA', name='location_type')))
    parent_station_id: Optional[int] = Field(default=None, sa_column=Column('parent_station_id', Integer))
    timezone: Optional[str] = Field(default=None, sa_column=Column('timezone', Text))
    wheelchair_boarding: Optional[str] = Field(default=None, sa_column=Column('wheelchair_boarding', Enum('NO_INFO', 'ACCESSIBLE', 'NOT_ACCESSIBLE', name='wheelchair_boarding')))

    agency: Optional['Agencies'] = Relationship(back_populates='stops')
    parent_station: Optional['Stops'] = Relationship(back_populates='parent_station_reverse')
    parent_station_reverse: list['Stops'] = Relationship(back_populates='parent_station')
    stop_times: list['StopTimes'] = Relationship(back_populates='stop')
    vehicle_positions: list['VehiclePositions'] = Relationship(back_populates='stop')


class Vehicles(SQLModel, table=True):
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='vehicles_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('id', name='vehicles_pkey'),
        UniqueConstraint('agency_id', 'vehicle_sid', name='uq_vehicles_agency_vehicle_sid'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    agency_id: str = Field(sa_column=Column('agency_id', Text, nullable=False))
    vehicle_sid: str = Field(sa_column=Column('vehicle_sid', Text, nullable=False))
    label: Optional[str] = Field(default=None, sa_column=Column('label', Text))
    license_plate: Optional[str] = Field(default=None, sa_column=Column('license_plate', Text))
    wheelchair_accessible: Optional[str] = Field(default=None, sa_column=Column('wheelchair_accessible', Enum('NO_INFO', 'ACCESSIBLE', 'NOT_ACCESSIBLE', name='wheelchair_boarding')))

    agency: Optional['Agencies'] = Relationship(back_populates='vehicles')
    trip_instances: list['TripInstances'] = Relationship(back_populates='vehicle')
    vehicle_positions: list['VehiclePositions'] = Relationship(back_populates='vehicle')


class Trips(SQLModel, table=True):
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='trips_agency_id_agencies_id_fk'),
        ForeignKeyConstraint(['route_id'], ['transit.routes.id'], name='trips_route_id_routes_id_fk'),
        ForeignKeyConstraint(['shape_id'], ['transit.shapes.id'], name='trips_shape_id_shapes_id_fk'),
        PrimaryKeyConstraint('id', name='trips_pkey'),
        UniqueConstraint('agency_id', 'trip_sid', name='uq_trips_agency_trip_sid'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    trip_sid: str = Field(sa_column=Column('trip_sid', Text, nullable=False))
    service_sid: str = Field(sa_column=Column('service_sid', Text, nullable=False))
    agency_id: Optional[str] = Field(default=None, sa_column=Column('agency_id', Text))
    route_id: Optional[int] = Field(default=None, sa_column=Column('route_id', Integer))
    shape_id: Optional[int] = Field(default=None, sa_column=Column('shape_id', Integer))
    headsign: Optional[str] = Field(default=None, sa_column=Column('headsign', Text))
    short_name: Optional[str] = Field(default=None, sa_column=Column('short_name', Text))
    direction: Optional[str] = Field(default=None, sa_column=Column('direction', Enum('OUTBOUND', 'INBOUND', name='direction')))
    block_id: Optional[str] = Field(default=None, sa_column=Column('block_id', Text))

    agency: Optional['Agencies'] = Relationship(back_populates='trips')
    route: Optional['Routes'] = Relationship(back_populates='trips')
    shape: Optional['Shapes'] = Relationship(back_populates='trips')
    stop_times: list['StopTimes'] = Relationship(back_populates='trip')
    trip_instances: list['TripInstances'] = Relationship(back_populates='trip')


class StopTimes(SQLModel, table=True):
    __tablename__ = 'stop_times'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='stop_times_agency_id_agencies_id_fk'),
        ForeignKeyConstraint(['stop_id'], ['transit.stops.id'], name='stop_times_stop_id_stops_id_fk'),
        ForeignKeyConstraint(['trip_id'], ['transit.trips.id'], name='stop_times_trip_id_trips_id_fk'),
        PrimaryKeyConstraint('id', name='stop_times_pkey'),
        UniqueConstraint('agency_id', 'trip_sid', 'stop_sequence', name='uq_stop_times_agency_trip_sequence'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    trip_sid: str = Field(sa_column=Column('trip_sid', Text, nullable=False))
    stop_sid: str = Field(sa_column=Column('stop_sid', Text, nullable=False))
    stop_sequence: int = Field(sa_column=Column('stop_sequence', Integer, nullable=False))
    agency_id: Optional[str] = Field(default=None, sa_column=Column('agency_id', Text))
    trip_id: Optional[int] = Field(default=None, sa_column=Column('trip_id', Integer))
    stop_id: Optional[int] = Field(default=None, sa_column=Column('stop_id', Integer))
    arrival_time: Optional[datetime.datetime] = Field(default=None, sa_column=Column('arrival_time', DateTime(True)))
    departure_time: Optional[datetime.datetime] = Field(default=None, sa_column=Column('departure_time', DateTime(True)))
    stop_headsign: Optional[str] = Field(default=None, sa_column=Column('stop_headsign', Text))
    pickup_type: Optional[str] = Field(default=None, sa_column=Column('pickup_type', Enum('REGULAR', 'NO_PICKUP_OR_DROP_OFF', 'PHONE_AGENCY', 'COORDINATE_WITH_DRIVER', name='pickup_drop_off')))
    drop_off_type: Optional[str] = Field(default=None, sa_column=Column('drop_off_type', Enum('REGULAR', 'NO_PICKUP_OR_DROP_OFF', 'PHONE_AGENCY', 'COORDINATE_WITH_DRIVER', name='pickup_drop_off')))
    timepoint: Optional[str] = Field(default=None, sa_column=Column('timepoint', Enum('APPROXIMATE', 'EXACT', name='timepoint'), server_default=text("'EXACT'::timepoint")))
    shape_dist_traveled: Optional[float] = Field(default=None, sa_column=Column('shape_dist_traveled', Double(53)))

    agency: Optional['Agencies'] = Relationship(back_populates='stop_times')
    stop: Optional['Stops'] = Relationship(back_populates='stop_times')
    trip: Optional['Trips'] = Relationship(back_populates='stop_times')
    stop_time_instances: list['StopTimeInstances'] = Relationship(back_populates='stop_time')


class TripInstances(SQLModel, table=True):
    __tablename__ = 'trip_instances'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='trip_instances_agency_id_agencies_id_fk'),
        ForeignKeyConstraint(['route_id'], ['transit.routes.id'], name='trip_instances_route_id_routes_id_fk'),
        ForeignKeyConstraint(['shape_id'], ['transit.shapes.id'], name='trip_instances_shape_id_shapes_id_fk'),
        ForeignKeyConstraint(['trip_id'], ['transit.trips.id'], name='trip_instances_trip_id_trips_id_fk'),
        ForeignKeyConstraint(['vehicle_id'], ['transit.vehicles.id'], name='trip_instances_vehicle_id_vehicles_id_fk'),
        PrimaryKeyConstraint('id', name='trip_instances_pkey'),
        UniqueConstraint('agency_id', 'trip_id', 'start_date', name='uq_trip_instances_agency_trip_date'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    agency_id: str = Field(sa_column=Column('agency_id', Text, nullable=False))
    trip_id: int = Field(sa_column=Column('trip_id', Integer, nullable=False))
    route_id: int = Field(sa_column=Column('route_id', Integer, nullable=False))
    start_date: str = Field(sa_column=Column('start_date', String(8), nullable=False))
    start_time: str = Field(sa_column=Column('start_time', String(8), nullable=False))
    start_datetime: datetime.datetime = Field(sa_column=Column('start_datetime', DateTime(True), nullable=False))
    state: str = Field(sa_column=Column('state', Enum('PRISTINE', 'DIRTY', 'REMOVED', name='trip_instance_state'), nullable=False, server_default=text("'PRISTINE'::trip_instance_state")))
    shape_id: Optional[int] = Field(default=None, sa_column=Column('shape_id', Integer))
    vehicle_id: Optional[int] = Field(default=None, sa_column=Column('vehicle_id', Integer))
    last_trip_update_at: Optional[datetime.datetime] = Field(default=None, sa_column=Column('last_trip_update_at', DateTime(True)))

    agency: Optional['Agencies'] = Relationship(back_populates='trip_instances')
    route: Optional['Routes'] = Relationship(back_populates='trip_instances')
    shape: Optional['Shapes'] = Relationship(back_populates='trip_instances')
    trip: Optional['Trips'] = Relationship(back_populates='trip_instances')
    vehicle: Optional['Vehicles'] = Relationship(back_populates='trip_instances')
    stop_time_instances: list['StopTimeInstances'] = Relationship(back_populates='trip_instance')
    vehicle_positions: list['VehiclePositions'] = Relationship(back_populates='trip_instance')


class StopTimeInstances(SQLModel, table=True):
    __tablename__ = 'stop_time_instances'
    __table_args__ = (
        ForeignKeyConstraint(['stop_time_id'], ['transit.stop_times.id'], name='stop_time_instances_stop_time_id_stop_times_id_fk'),
        ForeignKeyConstraint(['trip_instance_id'], ['transit.trip_instances.id'], name='stop_time_instances_trip_instance_id_trip_instances_id_fk'),
        PrimaryKeyConstraint('id', name='stop_time_instances_pkey'),
        Index('idx_stop_time_instances_trip_instance_id', 'trip_instance_id'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    trip_instance_id: int = Field(sa_column=Column('trip_instance_id', Integer, nullable=False))
    stop_time_id: int = Field(sa_column=Column('stop_time_id', Integer, nullable=False))
    predicted_arrival_time: Optional[datetime.datetime] = Field(default=None, sa_column=Column('predicted_arrival_time', DateTime(True)))
    predicted_departure_time: Optional[datetime.datetime] = Field(default=None, sa_column=Column('predicted_departure_time', DateTime(True)))
    predicted_arrival_uncertainty: Optional[int] = Field(default=None, sa_column=Column('predicted_arrival_uncertainty', Integer))
    predicted_departure_uncertainty: Optional[int] = Field(default=None, sa_column=Column('predicted_departure_uncertainty', Integer))
    schedule_relationship: Optional[str] = Field(default=None, sa_column=Column('schedule_relationship', Enum('SCHEDULED', 'SKIPPED', 'NO_DATA', 'UNSCHEDULED', name='stop_time_update_schedule_relationship'), server_default=text("'SCHEDULED'::stop_time_update_schedule_relationship")))

    stop_time: Optional['StopTimes'] = Relationship(back_populates='stop_time_instances')
    trip_instance: Optional['TripInstances'] = Relationship(back_populates='stop_time_instances')


class VehiclePositions(SQLModel, table=True):
    __tablename__ = 'vehicle_positions'
    __table_args__ = (
        ForeignKeyConstraint(['stop_id'], ['transit.stops.id'], name='vehicle_positions_stop_id_stops_id_fk'),
        ForeignKeyConstraint(['trip_instance_id'], ['transit.trip_instances.id'], name='vehicle_positions_trip_instance_id_trip_instances_id_fk'),
        ForeignKeyConstraint(['vehicle_id'], ['transit.vehicles.id'], name='vehicle_positions_vehicle_id_vehicles_id_fk'),
        PrimaryKeyConstraint('id', name='vehicle_positions_pkey'),
        UniqueConstraint('vehicle_id', 'timestamp', name='uq_vehicle_positions_vehicle_timestamp'),
        Index('idx_vehicle_positions_location_gist', 'location'),
        {'schema': 'transit'}
    )

    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    vehicle_id: int = Field(sa_column=Column('vehicle_id', Integer, nullable=False))
    timestamp: datetime.datetime = Field(sa_column=Column('timestamp', DateTime(True), nullable=False))
    location: Any = Field(sa_column=Column('location', Geometry('POINT', dimension=2, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False))
    trip_instance_id: Optional[int] = Field(default=None, sa_column=Column('trip_instance_id', Integer))
    stop_id: Optional[int] = Field(default=None, sa_column=Column('stop_id', Integer))
    current_stop_sequence: Optional[int] = Field(default=None, sa_column=Column('current_stop_sequence', Integer))
    current_status: Optional[str] = Field(default=None, sa_column=Column('current_status', Enum('INCOMING_AT', 'STOPPED_AT', 'IN_TRANSIT_TO', name='vehicle_stop_status')))
    congestion_level: Optional[str] = Field(default=None, sa_column=Column('congestion_level', Enum('UNKNOWN_CONGESTION_LEVEL', 'RUNNING_SMOOTHLY', 'STOP_AND_GO', 'CONGESTION', 'SEVERE_CONGESTION', name='congestion_level')))
    occupancy_status: Optional[str] = Field(default=None, sa_column=Column('occupancy_status', Enum('EMPTY', 'MANY_SEATS_AVAILABLE', 'FEW_SEATS_AVAILABLE', 'STANDING_ROOM_ONLY', 'CRUSHED_STANDING_ROOM_ONLY', 'FULL', 'NOT_ACCEPTING_PASSENGERS', 'NO_DATA_AVAILABLE', 'NOT_BOARDABLE', name='occupancy_status')))
    occupancy_percentage: Optional[int] = Field(default=None, sa_column=Column('occupancy_percentage', Integer))
    bearing: Optional[float] = Field(default=None, sa_column=Column('bearing', Double(53)))
    odometer: Optional[float] = Field(default=None, sa_column=Column('odometer', Double(53)))
    speed: Optional[float] = Field(default=None, sa_column=Column('speed', Double(53)))
    ingested_at: Optional[datetime.datetime] = Field(default=None, sa_column=Column('ingested_at', DateTime(True), server_default=text('now()')))

    stop: Optional['Stops'] = Relationship(back_populates='vehicle_positions')
    trip_instance: Optional['TripInstances'] = Relationship(back_populates='vehicle_positions')
    vehicle: Optional['Vehicles'] = Relationship(back_populates='vehicle_positions')
