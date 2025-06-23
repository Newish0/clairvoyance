import logging
from logger_config import setup_logger
from typing import Any, AsyncGenerator, Callable, Dict, Iterable, List, Type
from beanie import Document


class BatchUpsert:
    def __init__(
        self,
        batch_size: int = 100,
        logger: logging.Logger = None,
    ):
        self.batch_size = batch_size
        self.logger = logger or setup_logger(__name__)

    async def upsert(
        self,
        collection: Type[Document],
        items: Iterable[Document],
        key_fn: Callable[[Document], Dict[str, Any]],
        insert_only_fn: Callable[[Document], bool] | None = None,
    ):
        """
        Batch upsert with deep comparison and filtering.

        Args:
            collection (Type[Document]): Collection to upsert into.
            items (Iterable[Document]): Iterable of documents to upsert.
            key_fn (Callable[[Document], Dict[str, Any]]): Function to get key for upsert.
            insert_only_fn (Callable[[Document], bool], optional): Only allow insert (no update) if true given document.
        """
        stats = {"inserted": 0, "updated": 0, "unchanged": 0, "total": 0, "errored": 0}

        async for batch in self._batched(items):
            batch_stats = await self._process_batch(
                collection, batch, key_fn, insert_only_fn
            )
            for k, v in batch_stats.items():
                stats[k] += v

        self.logger.info(f"{collection.__name__}: {stats}")

    async def _batched(self, items: Iterable) -> AsyncGenerator[List, None]:
        """Yield batches of items."""
        batch = []
        for item in items:
            batch.append(item)
            if len(batch) >= self.batch_size:
                yield batch
                batch = []
        if batch:
            yield batch

    async def _process_batch(
        self,
        collection: Type[Document],
        batch: List[Document],
        key_fn: Callable,
        insert_only_fn: Callable[[Document], bool] | None = None,
        num_retries: int = 5,
    ) -> Dict[str, int]:
        """Process single batch with upsert logic."""
        stats = {"inserted": 0, "updated": 0, "unchanged": 0, "total": 0, "errored": 0}

        for doc in batch:
            stats["total"] += 1

            # Try upsert multiple times on fail
            for _ in range(num_retries):
                # Try to find existing document and do upsert if exists
                # If fail, just insert (pretend document doesn't exist)
                try:
                    existing = await collection.find_one(key_fn(doc))
                except Exception as e:
                    self.logger.error(
                        f"Failed to find existing document: {e}", exc_info=True
                    )
                    existing = None

                insert_only = insert_only_fn(doc) if insert_only_fn else False

                try:
                    if not existing:
                        await doc.insert()
                        stats["inserted"] += 1
                    elif not insert_only and self._differs(existing, doc):
                        doc.id = existing.id
                        doc.revision_id = existing.revision_id
                        await doc.replace()
                        stats["updated"] += 1
                    else:
                        stats["unchanged"] += 1
                except Exception as e:
                    self.logger.error(
                        f"Failed to upsert document: {e}. Retrying...", exc_info=True
                    )
                    continue

                break

        # Add errored count
        stats["errored"] = (
            stats["total"] - stats["inserted"] - stats["updated"] - stats["unchanged"]
        )

        return stats

    def _differs(self, doc1: Document, doc2: Document) -> bool:
        """Deep compare excluding _id and revision_id fields."""
        d1 = doc1.model_dump(exclude={"_id", "id", "revision_id"})
        d2 = doc2.model_dump(exclude={"_id", "id", "revision_id"})
        return d1 != d2
