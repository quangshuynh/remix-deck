# Remix Deck backend

Everything the browser cannot do: stem separation, heavy renders, and a Spotify
metadata proxy that keeps the client secret off the client.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
cp .env.example .env          # then fill in the Spotify keys, if you want search
uvicorn app.main:app --reload --port 8000
```

`ffmpeg` must be on PATH for `/render`. `GET /health` reports whether it was found
and whether Spotify credentials are configured.

## Tests

```bash
.venv/Scripts/python.exe smoke_test.py    # API surface, no ffmpeg or Demucs needed
.venv/Scripts/python.exe render_test.py   # real ffmpeg renders; pip install imageio-ffmpeg
```

`render_test.py` uses the ffmpeg binary bundled with `imageio-ffmpeg` so it can run without
one installed system wide. It checks output length against `duration / rate`, which is what
catches an accidental switch from `asetrate` to `atempo`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Readiness, plus whether ffmpeg and Spotify are available |
| `POST` | `/separate` | Upload audio, run Demucs, get `vocals` and `instrumental` |
| `POST` | `/render` | Upload audio plus params, render with ffmpeg |
| `GET` | `/jobs/{id}` | Poll state, progress, and available outputs |
| `GET` | `/jobs/{id}/files/{name}` | Download an output |
| `GET` | `/search?q=` | Spotify track metadata |

`/separate` and `/render` return `202` with a job id immediately. Demucs takes minutes
and pins a CPU, so the client polls instead of holding a request open. A semaphore caps
concurrent separations at `MAX_CONCURRENT_JOBS`.

## Why separation needs a server

Instrumental and Karaoke are the two presets that are genuinely impossible in the
browser. Every other effect in this app is a filter applied to a finished mix; unmixing
one into its parts is a learned model, and there is no filter chain that does it.

## Rate is not tempo

`build_filter` uses `asetrate` and never `atempo`. `atempo` preserves pitch, which is
exactly wrong here: rate is a turntable pitch fader, so speed and pitch move together and
a server render has to agree with what the browser previewed.

## Metadata is metadata

`/search` returns titles, artists, artwork and durations so an export can be tagged. It
never fetches audio. Spotify and Apple streams are DRM protected and YouTube's terms
prohibit downloading, so the only audio this service ever touches is a file the user
uploaded themselves. `preview_url`, when present, is Spotify's own hosted 30 second clip
and is passed through untouched.

## Cleanup

Every job gets its own directory under `WORK_DIR`. A sweeper runs each minute and deletes
jobs, uploads and outputs older than `FILE_TTL_SECONDS`, including orphaned directories
left behind by an earlier process.
