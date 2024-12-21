from sqlalchemy import Column, Integer, PrimaryKeyConstraint, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base


class Agency(Base):
    __tablename__ = "agencies"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    static_gtfs_url = Column(String)
    realtime_gtfs_url = Column(String)
    timezone = Column(String, nullable=False)
    lang = Column(String)
    phone = Column(String)
    fare_url = Column(String)
    email = Column(String)
    routes = relationship("Route", back_populates="agency")


class Route(Base):
    __tablename__ = "routes"

    id = Column(String, primary_key=True)
    agency_id = Column(String, ForeignKey("agencies.id"))
    route_short_name = Column(String)
    route_long_name = Column(String)
    route_desc = Column(String)
    route_type = Column(Integer)
    route_url = Column(String)
    route_color = Column(String)
    route_text_color = Column(String)
    route_sort_order = Column(Integer)
    continuous_pickup = Column(Integer)
    continuous_drop_off = Column(Integer)
    agency = relationship("Agency", back_populates="routes")
    trips = relationship("Trip", back_populates="route")


class Trip(Base):
    __tablename__ = "trips"

    id = Column(String, primary_key=True)
    route_id = Column(String, ForeignKey("routes.id"))
    service_id = Column(String)
    trip_headsign = Column(String)
    trip_short_name = Column(String)
    direction_id = Column(Integer)
    block_id = Column(String)
    shape_id = Column(String) # No foreign key constraint on shape_id
    wheelchair_accessible = Column(Integer)
    bikes_allowed = Column(Integer)
    route = relationship("Route", back_populates="trips")
    stop_times = relationship("StopTime", back_populates="trip")


class Stop(Base):
    __tablename__ = "stops"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    code = Column(String)
    desc = Column(String)
    zone_id = Column(String)
    url = Column(String)
    location_type = Column(Integer, default=0)
    parent_station = Column(String, ForeignKey("stops.id"), nullable=True)
    timezone = Column(String)
    wheelchair_boarding = Column(Integer)
    level_id = Column(String)
    platform_code = Column(String)
    stop_times = relationship("StopTime", back_populates="stop")
    child_stops = relationship("Stop")


class StopTime(Base):
    __tablename__ = "stop_times"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(String, ForeignKey("trips.id"))
    stop_id = Column(String, ForeignKey("stops.id"))
    arrival_time = Column(String)
    departure_time = Column(String)
    stop_sequence = Column(Integer)
    stop_headsign = Column(String)
    pickup_type = Column(Integer, default=0)
    drop_off_type = Column(Integer, default=0)
    shape_dist_traveled = Column(Float)
    timepoint = Column(Integer, default=1)
    continuous_pickup = Column(Integer)
    continuous_drop_off = Column(Integer)
    trip = relationship("Trip", back_populates="stop_times")
    stop = relationship("Stop", back_populates="stop_times")


class Shape(Base):
    __tablename__ = "shapes"
    __table_args__ = (PrimaryKeyConstraint("shape_id", "shape_pt_sequence"),)

    shape_id = Column(String, index=True)
    shape_pt_lat = Column(Float, nullable=False)
    shape_pt_lon = Column(Float, nullable=False)
    shape_pt_sequence = Column(Integer, nullable=False)
    shape_dist_traveled = Column(Float)


class RealtimeUpdate(Base):
    __tablename__ = "realtime_updates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(String, ForeignKey("trips.id"))
    stop_id = Column(String, ForeignKey("stops.id"))
    arrival_delay = Column(Integer)
    departure_delay = Column(Integer)
    timestamp = Column(DateTime)
    vehicle_id = Column(String)
    current_status = Column(String)
