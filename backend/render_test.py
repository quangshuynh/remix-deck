"""
Exercises the real ffmpeg render path end to end, using the ffmpeg binary
bundled with imageio-ffmpeg so nothing has to be installed system wide.

    .venv/Scripts/python.exe render_test.py
"""

import asyncio
import math
import os
import shutil
import struct
import wave
from pathlib import Path

import imageio_ffmpeg

# Put the bundled binary on PATH under the name the app expects.
BIN = Path(imageio_ffmpeg.get_ffmpeg_exe())
SHIM = Path(__file__).parent / ".ffmpeg-shim"
SHIM.mkdir(exist_ok=True)
shutil.copy2(BIN, SHIM / "ffmpeg.exe")
os.environ["PATH"] = str(SHIM) + os.pathsep + os.environ["PATH"]

from app.audio_ops import render  # noqa: E402
from app.jobs import Job  # noqa: E402
from app.schemas import JobKind, RenderParams  # noqa: E402

SR = 48000


def make_source(path: Path, seconds=3.0):
    """A 220 Hz tone with a click track, so pitch and length are both checkable."""
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for i in range(int(SR * seconds)):
            t = i / SR
            v = 0.35 * math.sin(2 * math.pi * 220 * t)
            if i % SR < 400:  # a click each second
                v += 0.4 * math.exp(-(i % SR) / 60)
            s = int(max(-1, min(1, v)) * 32767)
            frames += struct.pack("<hh", s, s)
        w.writeframes(bytes(frames))


def probe(path: Path):
    with wave.open(str(path), "rb") as w:
        frames = w.getnframes()
        sr = w.getframerate()
        raw = w.readframes(frames)
    peak = 0
    for i in range(0, len(raw) - 1, 2):
        peak = max(peak, abs(struct.unpack_from("<h", raw, i)[0]) / 32768)
    return {"seconds": frames / sr, "sr": sr, "channels": w.getnchannels(), "peak": round(peak, 4)}


async def main():
    work = Path("./.rendertest")
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir()
    src = work / "source.wav"
    make_source(src)
    base = probe(src)
    print(f"source: {base}")

    cases = {
        "original": RenderParams(),
        "nightcore": RenderParams(rate=1.28, bass=2, air=2.5),
        "slowed_reverb": RenderParams(rate=0.82, bass=3, wet=0.38, decay=1.5),
        "8d": RenderParams(rate=1.0, rotate=0.14, width=0.95, wet=0.3, decay=1.0),
        "trap": RenderParams(rate=0.9, bass=10, air=2, punch=0.6),
        "telephone": RenderParams(rate=1.0, cut=500, tone=3000),
    }

    ok, fail = 0, 0
    for name, params in cases.items():
        job = Job(id=name, kind=JobKind.render, workdir=work / name)
        job.workdir.mkdir(parents=True, exist_ok=True)
        try:
            out = await render(job, src, params)
            info = probe(out)
            expected = base["seconds"] / params.rate
            # Reverb tail makes the file longer; without it length should match.
            tolerance = 0.35 if params.wet > 0 else 0.05
            length_ok = info["seconds"] >= expected - 0.05 and info["seconds"] <= expected + tolerance + 0.1
            clip_ok = info["peak"] <= 0.9
            audible = info["peak"] > 0.01
            good = length_ok and clip_ok and audible
            ok, fail = (ok + 1, fail) if good else (ok, fail + 1)
            print(
                f"{'PASS' if good else 'FAIL'}  {name:14} {info}  "
                f"expected~{expected:.2f}s len_ok={length_ok} clip_ok={clip_ok} audible={audible}"
            )
        except Exception as exc:
            fail += 1
            print(f"FAIL  {name:14} raised: {exc}")

    print(f"\n{ok} passed, {fail} failed")
    shutil.rmtree(work, ignore_errors=True)
    shutil.rmtree(SHIM, ignore_errors=True)
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
