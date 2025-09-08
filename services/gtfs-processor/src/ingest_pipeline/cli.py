import asyncio

from beanie import init_beanie

from ingest_pipeline.pipelines.gtfs.agency_pipeline import build_agency_pipeline
from ingest_pipeline.pipelines.gtfs.calendar_dates_pipeline import (
    build_calendar_dates_pipeline,
)
from ingest_pipeline.pipelines.gtfs.routes_pipeline import build_routes_pipeline
from ingest_pipeline.pipelines.gtfs.stop_times_pipeline import build_stop_times_pipeline
from ingest_pipeline.pipelines.gtfs.stops_pipeline import build_stops_pipeline
from ingest_pipeline.pipelines.gtfs.trips_pipeline import build_trips_pipeline
from ingest_pipeline.sources.gtfs.gtfs_archive import GTFSArchiveSource
from models.mongo_schemas import Agency, CalendarDate, Route, Stop, StopTime, Trip
from motor.motor_asyncio import AsyncIOMotorClient


async def run_pipelines():

    client = AsyncIOMotorClient("mongodb://localhost:27017")
    client["gtfs_data"]["agencies"].drop()
    client["gtfs_data"]["stop_times"].drop()
    client["gtfs_data"]["calendar_dates"].drop()
    client["gtfs_data"]["routes"].drop()
    client["gtfs_data"]["stops"].drop()
    client["gtfs_data"]["trips"].drop()
    await init_beanie(
        database=client.gtfs_data,
        document_models=[Agency, StopTime, CalendarDate, Route, Stop, Trip],
    )

    url = "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48"
    async with GTFSArchiveSource(url).materialize() as tmpdir:
        agency_pipeline = build_agency_pipeline(tmpdir / "agency.txt", "BCT-48", Agency)
        calendar_dates_pipeline = build_calendar_dates_pipeline(
            tmpdir / "calendar_dates.txt", "BCT-48", CalendarDate
        )
        routes_pipeline = build_routes_pipeline(tmpdir / "routes.txt", "BCT-48", Route)
        stops_pipeline = build_stops_pipeline(tmpdir / "stops.txt", "BCT-48", Stop)
        trips_pipeline = build_trips_pipeline(tmpdir / "trips.txt", "BCT-48", Trip)
        stop_times_pipeline = build_stop_times_pipeline(
            tmpdir / "stop_times.txt", "BCT-48", StopTime
        )

        await asyncio.gather(
            agency_pipeline.run(),
            stop_times_pipeline.run(),
            calendar_dates_pipeline.run(),
            routes_pipeline.run(),
            stops_pipeline.run(),
            trips_pipeline.run(),
        )


def main():
    asyncio.run(run_pipelines())


if __name__ == "__main__":
    main()
