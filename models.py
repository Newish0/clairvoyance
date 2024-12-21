from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from database import Base

class Agency(Base):
    __tablename__ = "agencies"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    static_gtfs_url = Column(String)
    realtime_gtfs_url = Column(String)
    routes = relationship("Route", back_populates="agency")

class Route(Base):
    __tablename__ = "routes"

    id = Column(String, primary_key=True)
    agency_id = Column(String, ForeignKey("agencies.id"))
    route_short_name = Column(String)
    route_long_name = Column(String)
    route_type = Column(Integer)
    agency = relationship("Agency", back_populates="routes")
    trips = relationship("Trip", back_populates="route")

class Trip(Base):
    __tablename__ = "trips"

    id = Column(String, primary_key=True)
    route_id = Column(String, ForeignKey("routes.id"))
    service_id = Column(String)
    trip_headsign = Column(String)
    route = relationship("Route", back_populates="trips")
    stop_times = relationship("StopTime", back_populates="trip")

class Stop(Base):
    __tablename__ = "stops"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    stop_times = relationship("StopTime", back_populates="stop")

class StopTime(Base):
    __tablename__ = "stop_times"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(String, ForeignKey("trips.id"))
    stop_id = Column(String, ForeignKey("stops.id"))
    arrival_time = Column(String)
    departure_time = Column(String)
    stop_sequence = Column(Integer)
    trip = relationship("Trip", back_populates="stop_times")
    stop = relationship("Stop", back_populates="stop_times")

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