from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, List

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

from ingest_pipeline.core.types import Context, Sink


@dataclass
class UpsertOperation:
    """Represents an upsert operation for a SQLModel table."""

    model: type[SQLModel]
    values: Dict[str, Any]
    conflict_columns: List[str]  # Columns to match on (e.g., ["id"] or ["email"])
    ignore_columns: List[str] | None = (
        None  # Columns to NOT update (defaults to conflict_columns)
    )


class PostgresUpsertSink(Sink[UpsertOperation]):
    """
    Sink that writes SQLModel upsert operations to PostgreSQL in batches.
    """

    input_type: type[UpsertOperation] = UpsertOperation

    def __init__(self, session: AsyncSession, batch_size: int = 1000):
        self.session = session
        self.batch_size = batch_size

    async def consume(
        self, context: Context, inputs: AsyncIterator[UpsertOperation]
    ) -> None:
        buffer: List[UpsertOperation] = []

        async for op in inputs:
            buffer.append(op)
            if len(buffer) >= self.batch_size:
                await self._flush(buffer, context)
                buffer.clear()

        if buffer:
            await self._flush(buffer, context)

    async def _flush(self, ops: List[UpsertOperation], context: Context) -> None:
        if not ops:
            return

        # Group by (model, conflict_columns, ignore_columns) for batching
        groups: Dict[tuple, List[UpsertOperation]] = {}
        for op in ops:
            key = (op.model, tuple(op.conflict_columns), tuple(op.ignore_columns or []))
            groups.setdefault(key, []).append(op)

        # Execute each group
        for batch in groups.values():
            first = batch[0]
            stmt = pg_insert(first.model).values([op.values for op in batch])

            # Determine which columns to ignore (not update)
            ignore_set = (
                set(first.ignore_columns)
                if first.ignore_columns
                else set(first.conflict_columns)
            )

            # Update all columns except ignored ones
            update_dict = {
                col: stmt.excluded[col]
                for col in first.values.keys()
                if col not in ignore_set
            }

            stmt = stmt.on_conflict_do_update(
                index_elements=first.conflict_columns, set_=update_dict
            )


            await self.session.execute(stmt)
            context.telemetry.incr("postgres_upsert_sink.upserted", len(batch))

        await self.session.commit()
