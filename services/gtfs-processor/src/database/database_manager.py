import logging
from typing import List
from pymongo import AsyncMongoClient, MongoClient
from beanie import init_beanie, Document
from models.mongo_schemas import (
    Agency,
    CalendarDate,
    FeedInfo,
    Route,
    Shape,
    Stop,
    StopTime,
    Trip,
    TripInstance,
)
from utils.logger_config import setup_logger

DOCUMENT_MODELS = [
    Agency,
    StopTime,
    CalendarDate,
    Route,
    Stop,
    Trip,
    Shape,
    TripInstance,
    FeedInfo,
]


class DatabaseManager:
    """Async context manager to own the Motor client and initialize Beanie."""

    def __init__(
        self,
        connection_string: str,
        database_name: str,
        document_models: List[type[Document]] = DOCUMENT_MODELS,
        logger: logging.Logger = setup_logger("database_manager", logging.INFO),
    ):
        self.connection_string = connection_string
        self.database_name = database_name
        self.document_models = document_models
        self.logger = logger
        self.client: AsyncMongoClient | None = None

    async def connect(self) -> None:
        if self.client is not None:
            self.logger.debug("Database already connected.")
            return

        self.logger.info("Connecting to MongoDB...")
        self.client = AsyncMongoClient(self.connection_string)
        # Initialize beanie using the motor database object, so beanie models work.
        await init_beanie(
            database=self.client[self.database_name],
            document_models=self.document_models,
        )
        self.logger.info("Connected & init_beanie completed.")

    async def close(self) -> None:
        if self.client is not None:
            # motor client close is synchronous
            await self.client.close()
            self.client = None
            self.logger.info("MongoDB client closed.")

    async def drop_collections(self) -> None:
        if not self.client:
            raise RuntimeError("Database client is not connected.")
        try:
            self.logger.info("Dropping existing collections for document models...")
            for model in self.document_models:
                coll_name = model.Settings.name
                await self.client[self.database_name][coll_name].drop()
                self.logger.debug("Dropped collection: %s", coll_name)
            self.logger.info("All specified collections dropped.")

            # Recreate collections and indexes
            self.logger.info(
                "Recreating collections and indexes for document models..."
            )
            await init_beanie(
                database=self.client[self.database_name],
                document_models=self.document_models,
            )
            self.logger.info("Collections and indexes recreated.")
        except Exception:
            self.logger.exception("Failed when dropping collections.")
            raise

    @property
    def db(self):
        if not self.client:
            raise RuntimeError("Database client is not connected.")
        return self.client[self.database_name]

    async def __aenter__(self) -> "DatabaseManager":
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()
