from dataclasses import dataclass
import logging
from logger_config import setup_logger
from models import Agency
from models.gtfs_models import FeedInfo
from parsing.parsed_gtfs_data import ParsedGTFSData


class GTFSIngestManager:
    """
    Manages the ingestion of GTFS data by tracking hash, source, and versions.
    """

    @dataclass(frozen=True)
    class GTFSIngestInfo:
        agency_exists: bool
        data_exists: bool

    def __init__(self, logger: logging.Logger = None):
        self.logger = logger or setup_logger(__name__)

    async def get_info(self, config_agency_id: str, parsed_gtfs_data: ParsedGTFSData):
        db_agency = await Agency.find_one({"config_agency_id": config_agency_id})

        if db_agency is None:
            return self.GTFSIngestInfo(agency_exists=False, data_exists=False)

        data_exists = (
            db_agency.imported_feeds is not None
            and parsed_gtfs_data.agency.get("source_hash")
            in [feed.data_hash for feed in db_agency.imported_feeds]
        )

        return self.GTFSIngestInfo(agency_exists=True, data_exists=data_exists)

    async def track_data(
        self, config_agency_id: str, parsed_gtfs_data: ParsedGTFSData
    ) -> None:
        db_agency = await Agency.find_one({"config_agency_id": config_agency_id})

        if db_agency is None:
            db_agency = Agency(
                agency_id=parsed_gtfs_data.agency.get("agency_id"),
                config_agency_id=config_agency_id,
                name=parsed_gtfs_data.agency.get("name"),
                url=parsed_gtfs_data.agency.get("url"),
                timezone=parsed_gtfs_data.agency.get("timezone"),
                lang=parsed_gtfs_data.agency.get("lang"),
                phone=parsed_gtfs_data.agency.get("phone"),
                email=parsed_gtfs_data.agency.get("email"),
                imported_feeds=[],
            )

        db_agency.imported_feeds.append(
            FeedInfo(
                data_hash=parsed_gtfs_data.agency.get("source_hash"),
            )
        )

        await db_agency.save()
