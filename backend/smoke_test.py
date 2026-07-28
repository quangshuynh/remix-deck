"""
Smoke test for the backend. Runs without Demucs, torch or ffmpeg installed:
those are only needed at job execution time, not import time.

    .venv/Scripts/python.exe smoke_test.py
"""

import json
import wave
import struct
import math
import io

from fastapi.testclient import TestClient

from app.main import app
from app.audio_ops import build_filter
from app.schemas import RenderParams


def make_wav(seconds=1.0, sr=48000):
    """A real 440 Hz WAV, so upload handling is tested against actual bytes."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        frames = bytearray()
        for i in range(int(sr * seconds)):
            v = int(0.3 * 32767 * math.sin(2 * math.pi * 440 * i / sr))
            frames += struct.pack("<hh", v, v)
        w.writeframes(bytes(frames))
    return buf.getvalue()


def main():
    ok, fail = 0, 0

    def check(name, cond, extra=""):
        nonlocal ok, fail
        if cond:
            ok += 1
            print(f"  PASS  {name}")
        else:
            fail += 1
            print(f"  FAIL  {name} {extra}")

    with TestClient(app) as client:
        print("\n-- health --")
        r = client.get("/health")
        check("health 200", r.status_code == 200, r.text)
        check("reports ffmpeg presence", "ffmpeg" in r.json(), r.text)
        print(f"        {r.json()}")

        print("\n-- search (no credentials configured) --")
        r = client.get("/search", params={"q": "test"})
        check("503 not 500", r.status_code == 503, f"got {r.status_code}: {r.text[:120]}")
        check("explains what to set", "SPOTIFY_CLIENT_ID" in r.text, r.text[:120])

        r = client.get("/search")
        check("missing q is 422", r.status_code == 422, str(r.status_code))

        print("\n-- upload validation --")
        r = client.post("/separate", files={"file": ("track.txt", b"nope", "text/plain")})
        check("rejects wrong extension (415)", r.status_code == 415, f"{r.status_code} {r.text[:120]}")

        r = client.post("/separate", files={"file": ("empty.wav", b"", "audio/wav")})
        check("rejects empty upload (400)", r.status_code == 400, f"{r.status_code} {r.text[:120]}")

        print("\n-- render job lifecycle --")
        wav = make_wav()
        params = RenderParams(rate=0.82, bass=3, wet=0.38, decay=3.2).model_dump_json()
        r = client.post(
            "/render",
            files={"file": ("song.wav", wav, "audio/wav")},
            data={"params": params},
        )
        check("accepted with 202", r.status_code == 202, f"{r.status_code} {r.text[:200]}")
        if r.status_code == 202:
            job = r.json()
            check("returns a job id", bool(job.get("id")), str(job))
            check("has a TTL", job.get("expires_in", 0) > 0, str(job))

            s = client.get(f"/jobs/{job['id']}")
            check("job is pollable", s.status_code == 200, s.text[:200])
            print(f"        {s.json()}")

            # ffmpeg is absent here, so the job must fail cleanly, not hang.
            f = client.get(f"/jobs/{job['id']}/files/render")
            check("missing output 404s", f.status_code == 404, str(f.status_code))

        r = client.post(
            "/render",
            files={"file": ("song.wav", wav, "audio/wav")},
            data={"params": '{"rate": 99}'},
        )
        check("out-of-range param rejected (422)", r.status_code == 422, f"{r.status_code} {r.text[:160]}")

        r = client.get("/jobs/does-not-exist")
        check("unknown job 404s", r.status_code == 404, str(r.status_code))

    print("\n-- filtergraph --")
    g = build_filter(RemixParams := RenderParams(rate=1.28, bass=2, air=2.5), None)
    print(f"        nightcore: {g}")
    check("uses asetrate (pitch moves with speed)", "asetrate=61440" in g, g)
    check("never uses atempo", "atempo" not in g, g)
    check("has a limiter", "alimiter" in g, g)

    g2 = build_filter(RenderParams(rate=1.0, rotate=0.14, width=0.95, wet=0.3), None)
    check("8D uses apulsator", "apulsator" in g2, g2)

    g3 = build_filter(RenderParams(rate=1.0, cut=400), None)
    check("cut maps to highpass", "highpass=f=400" in g3, g3)

    g4 = build_filter(RenderParams(rate=1.0), None)
    check("neutral params stay clean", "asetrate" not in g4 and "highpass" not in g4, g4)

    print(f"\n{ok} passed, {fail} failed\n")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
