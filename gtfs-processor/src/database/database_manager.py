import logging
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.main import SQLModel
from utils.logger_config import setup_logger
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import event


class DatabaseManager:
    """Async context manager to own the database. NOTE: Migrations are done via Drizzle Kit."""

    def __init__(
        self,
        database_url: str,
        logger: logging.Logger = setup_logger("database_manager", logging.INFO),
        pool_size: int = 20,
        max_overflow: int = 80,
    ):
        self.database_url = database_url
        self.logger = logger
        self.engine = create_async_engine(
            self.database_url,
            echo=False,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_pre_ping=True,
        )

        # Set up connection event listeners
        @event.listens_for(self.engine.sync_engine.pool, "connect")
        def on_connect(dbapi_conn, connection_record):
            self.logger.info("Database connection established")

        @event.listens_for(self.engine.sync_engine.pool, "close")
        def on_close(dbapi_conn, connection_record):
            self.logger.info("Database connection closed")

    async def delete_all(self) -> None:
        """Delete all data from the database by deleting all rows from all tables."""
        try:
            async with self.createSession() as session:
                async with session.begin():
                    tables = list(reversed(SQLModel.metadata.sorted_tables))
                    self.logger.info(
                        f"Deleting data from {len(tables)} tables ({map(lambda t: t.name, tables)})"
                    )

                    for table in tables:
                        table_name = table.name
                        self.logger.debug(f"Deleting all rows from table: {table_name}")

                        try:
                            result = await session.exec(table.delete())
                            self.logger.debug(
                                f"Deleted {result.rowcount} rows from {table_name}"
                            )
                        except Exception as e:
                            self.logger.error(
                                f"Failed to delete from table {table_name}: {e}",
                                exc_info=True,
                            )
                            raise

                    self.logger.info("Successfully deleted all data from all tables")
        except Exception as e:
            self.logger.error(f"delete_all() failed: {e}", exc_info=True)
            raise

    def createSession(self) -> AsyncSession:
        return AsyncSession(self.engine)
