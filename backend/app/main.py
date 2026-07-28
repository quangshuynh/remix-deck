from __future__ import annotations

import asyncio
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .audio_ops import ToolMissing, render, separate
from .config import get_settings
from .jobs import Job, queue
from .schemas import JobKind, JobStatus, RenderParams, SearchResponse
from .spotify import SpotifyNotConfigured, spotify

ALLOWED_SUFFIXES = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".opus"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    queue.start()
    await queue.sweep()
    yield
    await queue.stop()


app = FastAPI(
    title="Remix Deck backend",
    version="0.1.0",
    summary="Stem separation, heavy renders, and a Spotify metadata proxy.",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Uploads
# ---------------------------------------------------------------------------


async def _store_upload(job: Job, upload: UploadFile) -> Path:
    """
    Streams an upload to the job directory, enforcing the size cap as it goes
    rather than reading the whole body into memory first.
    """
    suffix = Path(upload.filename or "audio").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{suffix or 'unknown'}'. "
            f"Accepted: {', '.join(sorted(ALLOWED_SUFFIXES))}",
        )

    target = job.workdir / f"source{suffix}"
    limit = settings.max_upload_bytes
    written = 0

    with target.open("wb") as handle:
        while chunk := await upload.read(1024 * 1024):
            written += len(chunk)
            if written > limit:
                handle.close()
                shutil.rmtree(job.workdir, ignore_errors=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds the {settings.max_upload_mb} MB limit",
                )
            handle.write(chunk)

    if written == 0:
        raise HTTPException(status_code=400, detail="Empty upload")
    return target


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "spotify_configured": settings.spotify_configured,
        "max_upload_mb": settings.max_upload_mb,
        "file_ttl_seconds": settings.file_ttl_seconds,
    }


@app.post("/separate", response_model=JobStatus, status_code=202)
async def post_separate(file: UploadFile = File(...)) -> JobStatus:
    """
    Splits an upload into vocals and instrumental with Demucs.

    Returns immediately with a job id: separation takes minutes, so the client
    polls /jobs/{id} for progress and then downloads the stems.
    """
    job = await queue.create(JobKind.separate)
    source = await _store_upload(job, file)

    async def work(j: Job) -> None:
        await separate(j, source)

    asyncio.create_task(queue.run(job, work))
    return job.status(settings.file_ttl_seconds)


@app.post("/render", response_model=JobStatus, status_code=202)
async def post_render(
    file: UploadFile = File(...),
    params: str = Form(
        "{}", description="RemixParams as a JSON object, matching the browser's"
    ),
) -> JobStatus:
    """Renders with ffmpeg, for jobs too slow to run in the browser."""
    try:
        parsed = RenderParams.model_validate_json(params)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Bad params: {exc}") from exc

    job = await queue.create(JobKind.render)
    source = await _store_upload(job, file)

    async def work(j: Job) -> None:
        await render(j, source, parsed)

    asyncio.create_task(queue.run(job, work))
    return job.status(settings.file_ttl_seconds)


@app.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job(job_id: str) -> JobStatus:
    job = queue.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=404, detail="Unknown job, or it expired and was cleaned up"
        )
    return job.status(settings.file_ttl_seconds)


@app.get("/jobs/{job_id}/files/{name}")
async def get_job_file(job_id: str, name: str) -> FileResponse:
    job = queue.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown or expired job")

    path = job.outputs.get(name)
    if path is None or not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No output named '{name}'. Available: {sorted(job.outputs) or 'none yet'}",
        )
    return FileResponse(path, filename=f"{name}{path.suffix}")


@app.get("/search", response_model=SearchResponse)
async def get_search(
    q: str = Query(..., min_length=1, max_length=120),
    limit: int = Query(8, ge=1, le=20),
) -> SearchResponse:
    """
    Proxies a Spotify track search so the client secret stays on the server.

    Metadata only: this returns what a song *is*, never the song. Use it to
    autofill title, artist and artwork on an export of a file you loaded.
    """
    try:
        return await spotify.search(q, limit)
    except SpotifyNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502, detail=f"Spotify rejected the request: {exc.response.status_code}"
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Spotify unreachable: {exc}") from exc


@app.exception_handler(ToolMissing)
async def tool_missing_handler(_, exc: ToolMissing):
    raise HTTPException(status_code=503, detail=str(exc))
