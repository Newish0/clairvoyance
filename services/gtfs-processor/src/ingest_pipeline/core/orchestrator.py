import asyncio
from typing import Any, AsyncIterator, Dict, Optional

from ingest_pipeline.core.errors import ErrorPolicy
from ingest_pipeline.core.telemetry import SimpleTelemetry
from ingest_pipeline.core.types import (
    Context,
    Sink,
    Source,
    StageSpec,
    Telemetry,
    Transformer,
)
from utils.logger_config import setup_logger
import logging

"""A sequence number for auto generated orchestrator names."""
orchestrator_seq = 0


class Orchestrator:
    """Compose and run StageSpec list as a pipeline with type-checking and backpressure."""

    def __init__(
        self,
        stages: list[StageSpec],
        telemetry: Optional[Telemetry] = None,
        error_policy: ErrorPolicy = ErrorPolicy.SKIP_RECORD,
        name: Optional[str] = None,
        log_level: int = logging.INFO,
    ):
        if len(stages) < 2:
            raise ValueError("pipeline must contain at least a source and a sink")

        if not name:
            global orchestrator_seq
            orchestrator_seq += 1
            self.name = f"{orchestrator_seq}"
        else:
            self.name = name

        self._logger = setup_logger(f"orchestrator {self.name}", log_level)

        self.stages = stages
        self.telemetry = telemetry or SimpleTelemetry(self._logger)
        self.error_policy = error_policy

        # Validate types at construction time
        self._validate_stage_io()

    def _get_output_type(self, idx: int) -> type[Any]:
        s = self.stages[idx].stage
        if hasattr(s, "output_type"):
            return getattr(s, "output_type")
        return type[Any]

    def _get_input_type(self, idx: int) -> type[Any]:
        s = self.stages[idx].stage
        if hasattr(s, "input_type"):
            return getattr(s, "input_type")
        return type[Any]

    def _is_compatible(self, output_t: type[Any], input_t: type[Any]) -> bool:
        if output_t is Any or input_t is Any:
            return True
        try:
            return output_t == input_t or issubclass(output_t, input_t)
        except Exception:
            return False

    def _validate_stage_io(self) -> None:
        # For each consecutive pair of stages, validate that output_type of i is compatible with input_type of i+1.
        for i in range(len(self.stages) - 1):
            out_t = self._get_output_type(i)
            in_t = self._get_input_type(i + 1)
            ok = self._is_compatible(out_t, in_t)
            if not ok:
                msg = (
                    f"Type mismatch between stage {i} ({self.stages[i].name}) "
                    f"output_type={out_t} and stage {i + 1} ({self.stages[i + 1].name}) "
                    f"input_type={in_t}. Set concrete .input_type/.output_type or use Any."
                )
                self._logger.error(msg)
                # Fail fast on type mismatch — prefer early failure
                raise TypeError(msg)
            else:
                self._logger.debug("Stage types compatible: %s -> %s", out_t, in_t)

    async def run(self) -> None:
        N = len(self.stages)
        # queues between stage i and i+1 are queues[i], length N-1
        queues: list[asyncio.Queue] = [
            asyncio.Queue(maxsize=self.stages[i].queue_size) for i in range(N - 1)
        ]
        SENTINEL = object()

        # shared event & exception holder for FAIL_FAST
        fatal_event = asyncio.Event()
        exception_holder: Dict[str, Optional[BaseException]] = {"exc": None}

        # Create context for all stages
        context = Context(
            logger=self._logger,
            telemetry=self.telemetry,
            error_policy=self.error_policy,
        )

        # helper generator to adapt a queue into an async iterator for workers.
        async def _queue_reader(q: asyncio.Queue) -> AsyncIterator[Any]:
            while True:
                item = await q.get()
                if item is SENTINEL:
                    break
                yield item

        # worker factories
        async def _source_worker(spec: StageSpec, out_q: asyncio.Queue) -> None:
            if not isinstance(spec.stage, Source):
                raise TypeError(f"Stage {spec.name} is not a Source")

            src: Source = spec.stage
            try:
                async for item in src.stream(context):
                    # If fatal event set, stop producing
                    if fatal_event.is_set():
                        break
                    await out_q.put(item)
                    self.telemetry.incr(f"{spec.name}.produced")
            except Exception as exc:
                self.telemetry.incr(f"{spec.name}.errors")
                self._logger.exception("source worker error in %s", spec.name)
                exception_holder["exc"] = exc

                if self.error_policy == ErrorPolicy.FAIL_FAST:
                    fatal_event.set()

        async def _transform_worker(
            spec: StageSpec, in_q: asyncio.Queue, out_q: asyncio.Queue
        ) -> None:
            if not isinstance(spec.stage, Transformer):
                raise TypeError(f"Stage {spec.name} is not a Transformer")

            transformer: Transformer = spec.stage
            # Each worker gets its own queue reader that competes for items.
            try:
                async for out_item in transformer.run(context, _queue_reader(in_q)):
                    if fatal_event.is_set():
                        break
                    await out_q.put(out_item)
                    self.telemetry.incr(f"{spec.name}.transformed")
            except Exception as exc:
                self.telemetry.incr(f"{spec.name}.errors")
                self._logger.exception("transform worker error in %s", spec.name)
                exception_holder["exc"] = exc
                if self.error_policy == ErrorPolicy.FAIL_FAST:
                    fatal_event.set()

        async def _sink_worker(spec: StageSpec, in_q: asyncio.Queue) -> None:
            if not isinstance(spec.stage, Sink):
                raise TypeError(f"Stage {spec.name} is not a Sink")

            sink: Sink = spec.stage
            try:
                await sink.consume(context, _queue_reader(in_q))
                self.telemetry.incr(f"{spec.name}.consumed")
            except Exception as exc:
                self.telemetry.incr(f"{spec.name}.errors")
                self._logger.exception("sink worker error in %s", spec.name)
                exception_holder["exc"] = exc
                if self.error_policy == ErrorPolicy.FAIL_FAST:
                    fatal_event.set()

        # start all worker groups and coordinators
        all_worker_groups: list[list[asyncio.Task]] = []
        coordinator_tasks: list[asyncio.Task] = []

        for idx, spec in enumerate(self.stages):
            # determine in/out queues for this stage
            has_out = idx < len(queues)
            in_q = queues[idx - 1] if idx > 0 else None
            out_q = queues[idx] if has_out else None

            group_tasks: list[asyncio.Task] = []
            if idx == 0:
                # Source stage -> has out_q
                assert out_q is not None
                for _ in range(spec.parallelism):
                    t = asyncio.create_task(_source_worker(spec, out_q))
                    group_tasks.append(t)
            elif idx == len(self.stages) - 1:
                # Sink stage -> has in_q
                assert in_q is not None
                for _ in range(spec.parallelism):
                    t = asyncio.create_task(_sink_worker(spec, in_q))
                    group_tasks.append(t)
            else:
                # Transformer stage
                assert in_q is not None and out_q is not None
                for _ in range(spec.parallelism):
                    t = asyncio.create_task(_transform_worker(spec, in_q, out_q))
                    group_tasks.append(t)

            all_worker_groups.append(group_tasks)

        # coordinators: wait for each worker group; when finished, inject sentinel tokens into next queue
        async def _coordinator_for_stage(stage_index: int):
            tasks = all_worker_groups[stage_index]
            # wait for the group's tasks to finish (they may exit because of sentinel or fatal_event)
            await asyncio.gather(*tasks, return_exceptions=True)

            # If there is a next queue, we must inject one sentinel per downstream worker
            if stage_index < len(self.stages) - 1:
                next_parallelism = self.stages[stage_index + 1].parallelism
                q = queues[stage_index]
                for _ in range(next_parallelism):
                    await q.put(SENTINEL)
                self._logger.debug(
                    "Coordinator: stage %s finished; injected %d sentinels into queue %d",
                    self.stages[stage_index].name,
                    next_parallelism,
                    stage_index,
                )

        # spawn all coordinators (they run concurrently)
        for i in range(len(self.stages)):
            coordinator_tasks.append(asyncio.create_task(_coordinator_for_stage(i)))

        # Wait for the final coordinator to finish (which implies the whole pipeline drained),
        # or for a fatal_event to be set.
        final_coord = coordinator_tasks[-1]
        fatal_wait_task = asyncio.create_task(fatal_event.wait())
        done, pending = await asyncio.wait(
            [final_coord, fatal_wait_task], return_when=asyncio.FIRST_COMPLETED
        )

        # If fatal_event set -> cancel all workers & coordinators
        if fatal_event.is_set():
            self._logger.error("Fatal event set. Cancelling tasks.")
            # cancel all worker tasks and coordinators
            for group in all_worker_groups:
                for t in group:
                    t.cancel()
            for c in coordinator_tasks:
                if not c.done():
                    c.cancel()
            # Cancel the fatal_wait_task too
            fatal_wait_task.cancel()
            # re-raise captured exception
            exc = exception_holder.get("exc")
            if exc:
                raise exc
            else:
                raise RuntimeError("Pipeline aborted due to fatal event")

        # Otherwise await all coordinators to finish normally
        # Cancel the fatal_wait_task since we don't need it anymore
        fatal_wait_task.cancel()
        await asyncio.gather(*coordinator_tasks, return_exceptions=True)
        self._logger.info(f"Pipeline {self.name} completed successfully.")
        self._logger.info(f"Pipeline {self.name} telemetry: \n{str(self.telemetry)}.")
