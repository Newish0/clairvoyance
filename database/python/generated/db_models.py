from typing import Any, Optional
import datetime

from geoalchemy2.types import Geometry
from sqlalchemy import DateTime, Double, Enum, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass


class Agencies(Base):
    __tablename__ = 'agencies'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='agencies_pkey'),
        {'schema': 'transit'}
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    agency_sid: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    timezone: Mapped[str] = mapped_column(Text, nullable=False)
    lang: Mapped[Optional[str]] = mapped_column(String(10))
    phone: Mapped[Optional[str]] = mapped_column(Text)
    fare_url: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)

    alerts: Mapped[list['Alerts']] = relationship('Alerts', back_populates='agency')
    calendar_dates: Mapped[list['CalendarDates']] = relationship('CalendarDates', back_populates='agency')
    routes: Mapped[list['Routes']] = relationship('Routes', back_populates='agency')
    shapes: Mapped[list['Shapes']] = relationship('Shapes', back_populates='agency')
    stops: Mapped[list['Stops']] = relationship('Stops', back_populates='agency')
    vehicles: Mapped[list['Vehicles']] = relationship('Vehicles', back_populates='agency')
    trips: Mapped[list['Trips']] = relationship('Trips', back_populates='agency')
    stop_times: Mapped[list['StopTimes']] = relationship('StopTimes', back_populates='agency')
    trip_instances: Mapped[list['TripInstances']] = relationship('TripInstances', back_populates='agency')


class Alerts(Base):
    __tablename__ = 'alerts'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='alerts_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('id', name='alerts_pkey'),
        UniqueConstraint('content_hash', name='alerts_content_hash_unique'),
        Index('idx_alerts_active_periods_gin', 'active_periods'),
        Index('idx_alerts_informed_entities_gin', 'informed_entities'),
        {'schema': 'transit'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agency_id: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)
    header_text: Mapped[dict] = mapped_column(JSONB, nullable=False)
    description_text: Mapped[dict] = mapped_column(JSONB, nullable=False)
    cause: Mapped[Optional[str]] = mapped_column(Enum('UNKNOWN_CAUSE', 'OTHER_CAUSE', 'TECHNICAL_PROBLEM', 'STRIKE', 'DEMONSTRATION', 'ACCIDENT', 'HOLIDAY', 'WEATHER', 'MAINTENANCE', 'CONSTRUCTION', 'POLICE_ACTIVITY', 'MEDICAL_EMERGENCY', name='alert_cause'), server_default=text("'UNKNOWN_CAUSE'::alert_cause"))
    effect: Mapped[Optional[str]] = mapped_column(Enum('NO_SERVICE', 'REDUCED_SERVICE', 'SIGNIFICANT_DELAYS', 'DETOUR', 'ADDITIONAL_SERVICE', 'MODIFIED_SERVICE', 'OTHER_EFFECT', 'UNKNOWN_EFFECT', 'STOP_MOVED', 'NO_EFFECT', 'ACCESSIBILITY_ISSUE', name='alert_effect'), server_default=text("'UNKNOWN_EFFECT'::alert_effect"))
    severity: Mapped[Optional[str]] = mapped_column(Enum('UNKNOWN_SEVERITY', 'INFO', 'WARNING', 'SEVERE', name='alert_severity'), server_default=text("'UNKNOWN_SEVERITY'::alert_severity"))
    url: Mapped[Optional[dict]] = mapped_column(JSONB)
    active_periods: Mapped[Optional[dict]] = mapped_column(JSONB)
    informed_entities: Mapped[Optional[dict]] = mapped_column(JSONB)
    last_seen: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    agency: Mapped['Agencies'] = relationship('Agencies', back_populates='alerts')


class CalendarDates(Base):
    __tablename__ = 'calendar_dates'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='calendar_dates_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('agency_id', 'service_sid', 'date', name='calendar_dates_agency_id_service_sid_date_pk'),
        {'schema': 'transit'}
    )

    agency_id: Mapped[str] = mapped_column(Text, primary_key=True)
    service_sid: Mapped[str] = mapped_column(Text, primary_key=True)
    date: Mapped[str] = mapped_column(String(8), primary_key=True)
    exception_type: Mapped[str] = mapped_column(Enum('ADDED', 'REMOVED', name='calendar_exception_type'), nullable=False)

    agency: Mapped['Agencies'] = relationship('Agencies', back_populates='calendar_dates')


class Routes(Base):
    __tablename__ = 'routes'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='routes_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('id', name='routes_pkey'),
        UniqueConstraint('agency_id', 'route_sid', name='uq_routes_agency_route_sid'),
        {'schema': 'transit'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agency_id: Mapped[str] = mapped_column(Text, nullable=False)
    route_sid: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Enum('TRAM', 'SUBWAY', 'RAIL', 'BUS', 'FERRY', 'CABLE_TRAM', 'AERIAL_LIFT', 'FUNICULAR', 'TROLLEYBUS', 'MONORAIL', name='route_type'), nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(Text)
    long_name: Mapped[Optional[str]] = mapped_column(Text)
    color: Mapped[Optional[str]] = mapped_column(String(6))
    text_color: Mapped[Optional[str]] = mapped_column(String(6))

    agency: Mapped['Agencies'] = relationship('Agencies', back_populates='routes')
    trips: Mapped[list['Trips']] = relationship('Trips', back_populates='route')
    trip_instances: Mapped[list['TripInstances']] = relationship('TripInstances', back_populates='route')


class Shapes(Base):
    __tablename__ = 'shapes'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='shapes_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('id', name='shapes_pkey'),
        Index('idx_shapes_path_gist', 'path'),
        Index('idx_shapes_shape_sid', 'shape_sid'),
        {'schema': 'transit'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agency_id: Mapped[str] = mapped_column(Text, nullable=False)
    shape_sid: Mapped[str] = mapped_column(Text, nullable=False)
    path: Mapped[Any] = mapped_column(Geometry('POINT', dimension=2, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False)
    distances_traveled: Mapped[Optional[dict]] = mapped_column(JSONB)

    agency: Mapped['Agencies'] = relationship('Agencies', back_populates='shapes')
    trips: Mapped[list['Trips']] = relationship('Trips', back_populates='shape')
    trip_instances: Mapped[list['TripInstances']] = relationship('TripInstances', back_populates='shape')


class Stops(Base):
    __tablename__ = 'stops'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='stops_agency_id_agencies_id_fk'),
        ForeignKeyConstraint(['parent_station_id'], ['transit.stops.id'], name='stops_parent_station_id_stops_id_fk'),
        PrimaryKeyConstraint('id', name='stops_pkey'),
        Index('idx_stops_agency_stop_sid', 'agency_id', 'stop_sid'),
        Index('idx_stops_location_gist', 'location'),
        {'schema': 'transit'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stop_sid: Mapped[str] = mapped_column(Text, nullable=False)
    agency_id: Mapped[Optional[str]] = mapped_column(Text)
    code: Mapped[Optional[str]] = mapped_column(Text)
    name: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    location: Mapped[Optional[Any]] = mapped_column(Geometry('POINT', dimension=2, from_text='ST_GeomFromEWKT', name='geometry'))
    zone_id: Mapped[Optional[str]] = mapped_column(Text)
    url: Mapped[Optional[str]] = mapped_column(Text)
    location_type: Mapped[Optional[str]] = mapped_column(Enum('STOP_OR_PLATFORM', 'STATION', 'ENTRANCE_EXIT', 'GENERIC_NODE', 'BOARDING_AREA', name='location_type'))
    parent_station_id: Mapped[Optional[int]] = mapped_column(Integer)
    timezone: Mapped[Optional[str]] = mapped_column(Text)
    wheelchair_boarding: Mapped[Optional[str]] = mapped_column(Enum('NO_INFO', 'ACCESSIBLE', 'NOT_ACCESSIBLE', name='wheelchair_boarding'))

    agency: Mapped[Optional['Agencies']] = relationship('Agencies', back_populates='stops')
    parent_station: Mapped[Optional['Stops']] = relationship('Stops', remote_side=[id], back_populates='parent_station_reverse')
    parent_station_reverse: Mapped[list['Stops']] = relationship('Stops', remote_side=[parent_station_id], back_populates='parent_station')
    stop_times: Mapped[list['StopTimes']] = relationship('StopTimes', back_populates='stop')
    vehicle_positions: Mapped[list['VehiclePositions']] = relationship('VehiclePositions', back_populates='stop')


class Vehicles(Base):
    __tablename__ = 'vehicles'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='vehicles_agency_id_agencies_id_fk'),
        PrimaryKeyConstraint('id', name='vehicles_pkey'),
        UniqueConstraint('agency_id', 'vehicle_sid', name='uq_vehicles_agency_vehicle_sid'),
        {'schema': 'transit'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agency_id: Mapped[str] = mapped_column(Text, nullable=False)
    vehicle_sid: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[Optional[str]] = mapped_column(Text)
    license_plate: Mapped[Optional[str]] = mapped_column(Text)
    wheelchair_accessible: Mapped[Optional[str]] = mapped_column(Enum('NO_INFO', 'ACCESSIBLE', 'NOT_ACCESSIBLE', name='wheelchair_boarding'))

    agency: Mapped['Agencies'] = relationship('Agencies', back_populates='vehicles')
    trip_instances: Mapped[list['TripInstances']] = relationship('TripInstances', back_populates='vehicle')
    vehicle_positions: Mapped[list['VehiclePositions']] = relationship('VehiclePositions', back_populates='vehicle')


class Trips(Base):
    __tablename__ = 'trips'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='trips_agency_id_agencies_id_fk'),
        ForeignKeyConstraint(['route_id'], ['transit.routes.id'], name='trips_route_id_routes_id_fk'),
        ForeignKeyConstraint(['shape_id'], ['transit.shapes.id'], name='trips_shape_id_shapes_id_fk'),
        PrimaryKeyConstraint('id', name='trips_pkey'),
        UniqueConstraint('agency_id', 'trip_sid', name='uq_trips_agency_trip_sid'),
        {'schema': 'transit'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_sid: Mapped[str] = mapped_column(Text, nullable=False)
    service_sid: Mapped[str] = mapped_column(Text, nullable=False)
    agency_id: Mapped[Optional[str]] = mapped_column(Text)
    route_id: Mapped[Optional[int]] = mapped_column(Integer)
    shape_id: Mapped[Optional[int]] = mapped_column(Integer)
    headsign: Mapped[Optional[str]] = mapped_column(Text)
    short_name: Mapped[Optional[str]] = mapped_column(Text)
    direction: Mapped[Optional[str]] = mapped_column(Enum('OUTBOUND', 'INBOUND', name='direction'))
    block_id: Mapped[Optional[str]] = mapped_column(Text)

    agency: Mapped[Optional['Agencies']] = relationship('Agencies', back_populates='trips')
    route: Mapped[Optional['Routes']] = relationship('Routes', back_populates='trips')
    shape: Mapped[Optional['Shapes']] = relationship('Shapes', back_populates='trips')
    stop_times: Mapped[list['StopTimes']] = relationship('StopTimes', back_populates='trip')
    trip_instances: Mapped[list['TripInstances']] = relationship('TripInstances', back_populates='trip')


class StopTimes(Base):
    __tablename__ = 'stop_times'
    __table_args__ = (
        ForeignKeyConstraint(['agency_id'], ['transit.agencies.id'], name='stop_times_agency_id_agencies_id_fk'),
        ForeignKeyConstraint(['stop_id'], ['transit.stops.id'], name='stop_times_stop_id_stops_id_fk'),
        ForeignKeyConstraint(['trip_id'], ['transit.trips.id'], name='stop_times_trip_id_trips_id_fk'),
        PrimaryKeyConstraint('id', name='stop_times_pkey'),
        UniqueConstraint('agency_id', 'trip_sid', 'stop_sequence', name='uq_stop_times_agency_trip_sequence'),
        {'schema': 'transit'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_sid: Mapped[str] = mapped_column(Text, nullable=False)
    stop_sid: Mapped[str] = mapped_column(Text, nullable=False)
    stop_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    agency_id: Mapped[Optional[str]] = mapped_column(Text)
    trip_id: Mapped[Optional[int]] = mapped_column(Integer)
    stop_id: Mapped[Optional[int]] = mapped_column(Integer)
    arrival_time: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    departure_time: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    stop_headsign: Mapped[Optional[str]] = mapped_column(Text)
    pickup_type: Mapped[Optional[str]] = mapped_column(Enum('REGULAR', 'NO_PICKUP_OR_DROP_OFF', 'PHONE_AGENCY', 'COORDINATE_WITH_DRIVER', name='pickup_drop_off'))
    drop_off_type: Mapped[Optional[str]] = mapped_column(Enum('REGULAR', 'NO_PICKUP_OR_DROP_OFF', 'PHONE_AGENCY', 'COORDINATE_WITH_DRIVER', name='pickup_drop_off'))
    timepoint: Mapped[Optional[str]] = mapped_column(Enum('APPROXIMATE', 'EXACT', name='timepoint'), server_default=text("'EXACT'::timepoint"))
    shape_dist_traveled: Mapped[Optional[float]] = mapped_column(Double(53))

    agency: Mapped[Optional['Agencies']] = relationship('Agencies', back_populates='stop_times')
    stop: Mapped[Optional['Stops']] = relationship('Stops', back_populates='stop_times')
    trip: Mapped[Optional['Trips']] = relationship('Trips', back_populates='stop_times')
    stop_time_instances: Mapped[list['StopTimeInstances']] = relationship('StopTimeInstances', back_populates='stop_time')


class TripInstances(Base):
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agency_id: Mapped[str] = mapped_column(Text, nullable=False)
    trip_id: Mapped[int] = mapped_column(Integer, nullable=False)
    route_id: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[str] = mapped_column(String(8), nullable=False)
    start_time: Mapped[str] = mapped_column(String(8), nullable=False)
    start_datetime: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    state: Mapped[str] = mapped_column(Enum('PRISTINE', 'DIRTY', 'REMOVED', name='trip_instance_state'), nullable=False, server_default=text("'PRISTINE'::trip_instance_state"))
    shape_id: Mapped[Optional[int]] = mapped_column(Integer)
    vehicle_id: Mapped[Optional[int]] = mapped_column(Integer)
    last_trip_update_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    agency: Mapped['Agencies'] = relationship('Agencies', back_populates='trip_instances')
    route: Mapped['Routes'] = relationship('Routes', back_populates='trip_instances')
    shape: Mapped[Optional['Shapes']] = relationship('Shapes', back_populates='trip_instances')
    trip: Mapped['Trips'] = relationship('Trips', back_populates='trip_instances')
    vehicle: Mapped[Optional['Vehicles']] = relationship('Vehicles', back_populates='trip_instances')
    stop_time_instances: Mapped[list['StopTimeInstances']] = relationship('StopTimeInstances', back_populates='trip_instance')
    vehicle_positions: Mapped[list['VehiclePositions']] = relationship('VehiclePositions', back_populates='trip_instance')


class StopTimeInstances(Base):
    __tablename__ = 'stop_time_instances'
    __table_args__ = (
        ForeignKeyConstraint(['stop_time_id'], ['transit.stop_times.id'], name='stop_time_instances_stop_time_id_stop_times_id_fk'),
        ForeignKeyConstraint(['trip_instance_id'], ['transit.trip_instances.id'], name='stop_time_instances_trip_instance_id_trip_instances_id_fk'),
        PrimaryKeyConstraint('id', name='stop_time_instances_pkey'),
        Index('idx_stop_time_instances_trip_instance_id', 'trip_instance_id'),
        {'schema': 'transit'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_instance_id: Mapped[int] = mapped_column(Integer, nullable=False)
    stop_time_id: Mapped[int] = mapped_column(Integer, nullable=False)
    predicted_arrival_time: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    predicted_departure_time: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    predicted_arrival_uncertainty: Mapped[Optional[int]] = mapped_column(Integer)
    predicted_departure_uncertainty: Mapped[Optional[int]] = mapped_column(Integer)
    schedule_relationship: Mapped[Optional[str]] = mapped_column(Enum('SCHEDULED', 'SKIPPED', 'NO_DATA', 'UNSCHEDULED', name='stop_time_update_schedule_relationship'), server_default=text("'SCHEDULED'::stop_time_update_schedule_relationship"))

    stop_time: Mapped['StopTimes'] = relationship('StopTimes', back_populates='stop_time_instances')
    trip_instance: Mapped['TripInstances'] = relationship('TripInstances', back_populates='stop_time_instances')


class VehiclePositions(Base):
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    location: Mapped[Any] = mapped_column(Geometry('POINT', dimension=2, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False)
    trip_instance_id: Mapped[Optional[int]] = mapped_column(Integer)
    stop_id: Mapped[Optional[int]] = mapped_column(Integer)
    current_stop_sequence: Mapped[Optional[int]] = mapped_column(Integer)
    current_status: Mapped[Optional[str]] = mapped_column(Enum('INCOMING_AT', 'STOPPED_AT', 'IN_TRANSIT_TO', name='vehicle_stop_status'))
    congestion_level: Mapped[Optional[str]] = mapped_column(Enum('UNKNOWN_CONGESTION_LEVEL', 'RUNNING_SMOOTHLY', 'STOP_AND_GO', 'CONGESTION', 'SEVERE_CONGESTION', name='congestion_level'))
    occupancy_status: Mapped[Optional[str]] = mapped_column(Enum('EMPTY', 'MANY_SEATS_AVAILABLE', 'FEW_SEATS_AVAILABLE', 'STANDING_ROOM_ONLY', 'CRUSHED_STANDING_ROOM_ONLY', 'FULL', 'NOT_ACCEPTING_PASSENGERS', 'NO_DATA_AVAILABLE', 'NOT_BOARDABLE', name='occupancy_status'))
    occupancy_percentage: Mapped[Optional[int]] = mapped_column(Integer)
    bearing: Mapped[Optional[float]] = mapped_column(Double(53))
    odometer: Mapped[Optional[float]] = mapped_column(Double(53))
    speed: Mapped[Optional[float]] = mapped_column(Double(53))
    ingested_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    stop: Mapped[Optional['Stops']] = relationship('Stops', back_populates='vehicle_positions')
    trip_instance: Mapped[Optional['TripInstances']] = relationship('TripInstances', back_populates='vehicle_positions')
    vehicle: Mapped['Vehicles'] = relationship('Vehicles', back_populates='vehicle_positions')
