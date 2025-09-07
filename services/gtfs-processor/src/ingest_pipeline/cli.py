import asyncio

from beanie import init_beanie

from ingest_pipeline.pipelines.gtfs.agency_pipeline import build_agency_pipeline
from ingest_pipeline.sources.gtfs.gtfs_archive import GTFSArchiveSource
from models.mongo_schemas import Agency
from motor.motor_asyncio import AsyncIOMotorClient


async def run_pipelines():

    client = AsyncIOMotorClient("mongodb://localhost:27017")
    client["gtfs_data"]["agencies"].drop()
    await init_beanie(database=client.gtfs_data, document_models=[Agency])

    url = "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48"
    async with GTFSArchiveSource(url).materialize() as tmpdir:
        agency_pipeline = build_agency_pipeline(tmpdir / "agency.txt", "BCT-48", Agency)

        await asyncio.gather(
            agency_pipeline.run(),
        )


def main():
    asyncio.run(run_pipelines())


if __name__ == "__main__":
    main()
