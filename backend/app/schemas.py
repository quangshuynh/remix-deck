from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class JobState(str, Enum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


class JobKind(str, Enum):
    separate = "separate"
    render = "render"


class JobStatus(BaseModel):
    id: str
    kind: JobKind
    state: JobState
    #: 0.0 to 1.0. Demucs reports real progress; ffmpeg jobs jump to 1.0.
    progress: float = 0.0
    detail: str = ""
    error: str | None = None
    #: Names of the artefacts ready for download, e.g. ["vocals", "instrumental"].
    outputs: list[str] = Field(default_factory=list)
    expires_in: int = 0


class RenderParams(BaseModel):
    """
    Mirrors the browser's RemixParams. Kept in sync deliberately: a render
    here should sound like the preview there.
    """

    rate: float = Field(1.0, ge=0.25, le=4.0)
    bass: float = Field(0.0, ge=-24, le=24)
    air: float = Field(0.0, ge=-24, le=24)
    tone: float = Field(20000.0, ge=200, le=22000)
    cut: float = Field(20.0, ge=20, le=2000)
    wet: float = Field(0.0, ge=0, le=1)
    decay: float = Field(2.0, ge=0.1, le=10)
    rotate: float = Field(0.0, ge=0, le=4)
    width: float = Field(0.0, ge=0, le=1)
    punch: float = Field(0.15, ge=0, le=1)
    gain: float = Field(0.9, ge=0, le=2)
    #: Output container. wav is lossless, mp3 is smaller.
    format: Literal["wav", "mp3"] = "wav"


class TrackMatch(BaseModel):
    """Metadata only. No audio is ever fetched from Spotify."""

    id: str
    title: str
    artist: str
    album: str
    artwork_url: str | None = None
    duration_ms: int
    #: Spotify's own 30 second clip, when they expose one. Often null.
    preview_url: str | None = None
    spotify_url: str


class SearchResponse(BaseModel):
    query: str
    results: list[TrackMatch]
    note: str = (
        "Metadata only. Searching finds information about a song, not the song "
        "itself. Load your own file to remix it."
    )
