from __future__ import annotations

import asyncio
import shutil
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .config import get_settings
from .schemas import JobKind, JobState, JobStatus


@dataclass
class Job:
    id: str
    kind: JobKind
    #: Per-job scratch directory; removed wholesale when the TTL expires.
    workdir: Path
    state: JobState = JobState.queued
    progress: float = 0.0
    detail: str = "Queued"
    error: str | None = None
    #: Logical name to file on disk, e.g. {"vocals": Path(...)}.
    outputs: dict[str, Path] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)

    def status(self, ttl: int) -> JobStatus:
        remaining = max(0, int(self.created_at + ttl - time.time()))
        return JobStatus(
            id=self.id,
            kind=self.kind,
            state=self.state,
            progress=round(self.progress, 3),
            detail=self.detail,
            error=self.error,
            outputs=sorted(self.outputs),
            expires_in=remaining,
        )


class JobQueue:
    """
    Small in-process job registry with a concurrency cap and a TTL sweeper.

    Demucs takes minutes and pins a CPU, so requests return a job id
    immediately and the client polls. A semaphore keeps concurrent
    separations to the configured limit rather than letting a handful of
    uploads thrash the machine.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_jobs)
        self._root = settings.work_dir
        self._ttl = settings.file_ttl_seconds
        self._sweeper: asyncio.Task[None] | None = None
        self._root.mkdir(parents=True, exist_ok=True)

    # -- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        if self._sweeper is None:
            self._sweeper = asyncio.create_task(self._sweep_forever())

    async def stop(self) -> None:
        if self._sweeper:
            self._sweeper.cancel()
            try:
                await self._sweeper
            except asyncio.CancelledError:
                pass
            self._sweeper = None

    # -- registry ----------------------------------------------------------

    async def create(self, kind: JobKind) -> Job:
        job_id = uuid.uuid4().hex
        workdir = self._root / job_id
        workdir.mkdir(parents=True, exist_ok=True)
        job = Job(id=job_id, kind=kind, workdir=workdir)
        async with self._lock:
            self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        job = self._jobs.get(job_id)
        if job and self._expired(job):
            return None
        return job

    async def run(self, job: Job, coro_factory) -> None:
        """
        Executes a job under the concurrency cap. Any exception is recorded on
        the job rather than raised, so a failed separation surfaces to the
        poller as a failed state with a message instead of a dead task.
        """
        async with self._semaphore:
            if self._expired(job):
                return
            job.state = JobState.running
            job.detail = "Working"
            try:
                await coro_factory(job)
                job.state = JobState.done
                job.progress = 1.0
                job.detail = "Complete"
            except asyncio.CancelledError:
                job.state = JobState.failed
                job.error = "Cancelled"
                raise
            except Exception as exc:  # noqa: BLE001 - reported, not swallowed
                job.state = JobState.failed
                job.error = str(exc)
                job.detail = "Failed"

    # -- cleanup -----------------------------------------------------------

    def _expired(self, job: Job) -> bool:
        return time.time() - job.created_at > self._ttl

    async def _sweep_forever(self) -> None:
        while True:
            try:
                await asyncio.sleep(60)
                await self.sweep()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a sweep failure must not kill the loop
                continue

    async def sweep(self) -> int:
        """Deletes expired jobs and their uploaded audio. Returns how many went."""
        removed = 0
        async with self._lock:
            for job_id in [j for j, job in self._jobs.items() if self._expired(job)]:
                job = self._jobs.pop(job_id)
                shutil.rmtree(job.workdir, ignore_errors=True)
                removed += 1

        # Directories with no matching job, e.g. left by a previous process.
        known = set(self._jobs)
        for path in self._root.iterdir() if self._root.exists() else []:
            if not path.is_dir() or path.name in known:
                continue
            if time.time() - path.stat().st_mtime > self._ttl:
                shutil.rmtree(path, ignore_errors=True)
                removed += 1
        return removed


queue = JobQueue()
