from __future__ import annotations

import asyncio
import math
import re
import struct
import sys
import wave
from pathlib import Path

from .config import get_settings
from .jobs import Job
from .schemas import RenderParams

PROGRESS_RE = re.compile(rb"(\d{1,3})%")


class ToolMissing(RuntimeError):
    pass


async def _run(cmd: list[str], on_line=None) -> None:
    """Runs a subprocess, streaming stderr so progress can be parsed live."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
    except FileNotFoundError as exc:
        raise ToolMissing(f"{cmd[0]} is not installed or not on PATH") from exc

    tail: list[bytes] = []
    assert proc.stdout is not None
    while True:
        chunk = await proc.stdout.read(256)
        if not chunk:
            break
        tail.append(chunk)
        del tail[:-40]
        if on_line:
            on_line(chunk)

    await proc.wait()
    if proc.returncode != 0:
        detail = b"".join(tail).decode("utf-8", "replace").strip()[-600:]
        raise RuntimeError(f"{Path(cmd[0]).name} failed: {detail}")


# ---------------------------------------------------------------------------
# Stem separation
# ---------------------------------------------------------------------------


async def separate(job: Job, source: Path) -> None:
    """
    Runs Demucs in two-stem mode and leaves vocals and instrumental in the
    job directory. This is what Instrumental and Karaoke need and what the
    browser genuinely cannot do: there is no way to unmix a stereo file with
    filters alone.
    """
    settings = get_settings()
    out_root = job.workdir / "stems"
    out_root.mkdir(exist_ok=True)

    def on_chunk(chunk: bytes) -> None:
        matches = PROGRESS_RE.findall(chunk)
        if matches:
            # Demucs reports per-shift progress; keep the highest seen so the
            # bar never jumps backwards between passes.
            pct = min(99, int(matches[-1]))
            job.progress = max(job.progress, pct / 100)
            job.detail = f"Separating stems, {pct}%"

    cmd = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems=vocals",
        "-n",
        settings.demucs_model,
        "-o",
        str(out_root),
        str(source),
    ]
    job.detail = "Loading model"
    await _run(cmd, on_chunk)

    # Demucs writes <out>/<model>/<track name>/{vocals,no_vocals}.wav
    produced = list(out_root.rglob("vocals.*"))
    if not produced:
        raise RuntimeError("Demucs produced no stems")

    stem_dir = produced[0].parent
    vocals = produced[0]
    instrumental = next(iter(stem_dir.glob("no_vocals.*")), None)

    job.outputs["vocals"] = vocals
    if instrumental:
        job.outputs["instrumental"] = instrumental


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def _write_impulse(path: Path, decay: float, sample_rate: int = 48000) -> None:
    """
    The same procedural reverb the browser builds, written to a file so
    ffmpeg's convolution filter can use it. Generated rather than shipped, so
    Decay stays a continuous control on both sides.
    """
    import random

    frames = max(1, int(sample_rate * max(0.05, decay)))
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)

        data = bytearray()
        smoothed = [0.0, 0.0]
        for i in range(frames):
            t = i / frames
            envelope = math.exp(-5 * t)
            onset = i / 64 if i < 64 else 1.0
            for channel in range(2):
                noise = random.uniform(-1, 1)
                smoothed[channel] += (noise - smoothed[channel]) * 0.42
                value = smoothed[channel] * envelope * onset
                data += struct.pack("<h", int(max(-1.0, min(1.0, value)) * 32767))
        handle.writeframes(bytes(data))


def build_filter(p: RemixParams, impulse: Path | None) -> str:
    """
    Maps the deck's parameters onto an ffmpeg filtergraph.

    The rate change uses asetrate, not atempo. atempo preserves pitch, which
    is exactly what this tool must not do: rate is a turntable pitch fader, so
    speed and pitch move together and the server has to agree with the browser.
    """
    sr = 48000
    chain = [f"aformat=sample_rates={sr}:channel_layouts=stereo"]

    if p.cut > 20:
        chain.append(f"highpass=f={p.cut:.0f}")
    if abs(p.bass) > 0.01:
        chain.append(f"bass=g={p.bass:.2f}:f=110")
    if abs(p.air) > 0.01:
        chain.append(f"treble=g={p.air:.2f}:f=7000")
    if p.tone < 19500:
        chain.append(f"lowpass=f={p.tone:.0f}")

    if abs(p.rate - 1.0) > 1e-4:
        chain.append(f"asetrate={int(sr * p.rate)},aresample={sr}")

    main = ",".join(chain)

    # Equal-power dry/wet, matching the browser's crossfade.
    dry_level = math.cos(p.wet * math.pi / 2)
    wet_level = math.sin(p.wet * math.pi / 2)

    if p.wet > 0.001 and impulse is not None:
        graph = (
            f"[0:a]{main}[pre];"
            f"[pre]asplit=2[dry][wetin];"
            f"[wetin][1:a]afir=dry=1:wet=1:maxir=10[wetfx];"
            f"[dry]volume={dry_level:.4f}[dryv];"
            f"[wetfx]volume={wet_level:.4f}[wetv];"
            f"[dryv][wetv]amix=inputs=2:normalize=0[mixed]"
        )
        tail_in = "[mixed]"
    else:
        graph = f"[0:a]{main}[mixed]"
        tail_in = "[mixed]"

    tail = []
    if p.rotate > 0 and p.width > 0:
        # apulsator auto-pans left against right, which is the 8D rotation.
        tail.append(f"apulsator=hz={p.rotate:.3f}:mode=sine:width={p.width:.3f}")

    threshold = 10 ** ((-6 - p.punch * 28) / 20)
    ratio = 2 + p.punch * 12
    tail.append(
        f"acompressor=threshold={threshold:.5f}:ratio={ratio:.2f}"
        f":attack={max(1, (0.01 - p.punch * 0.008) * 1000):.1f}"
        f":release={max(10, (0.3 - p.punch * 0.18) * 1000):.0f}"
    )
    tail.append(f"volume={p.gain * (1 + p.punch * 0.5):.4f}")
    # Guard rail, same intent as the browser's limiter: loud, never clipped.
    tail.append("alimiter=limit=0.891:level=disabled")

    graph += ";" + tail_in + ",".join([""] + tail).lstrip(",") + "[out]"
    return graph


async def render(job: Job, source: Path, params: RemixParams) -> Path:
    """Renders with ffmpeg, for material too slow to process client side."""
    impulse: Path | None = None
    if params.wet > 0.001:
        impulse = job.workdir / "impulse.wav"
        job.detail = "Building impulse response"
        await asyncio.to_thread(_write_impulse, impulse, params.decay)

    suffix = "wav" if params.format == "wav" else "mp3"
    target = job.workdir / f"render.{suffix}"
    graph = build_filter(params, impulse)

    cmd = ["ffmpeg", "-y", "-i", str(source)]
    if impulse is not None:
        cmd += ["-i", str(impulse)]
    cmd += ["-filter_complex", graph, "-map", "[out]"]
    if suffix == "wav":
        cmd += ["-c:a", "pcm_s16le"]
    else:
        cmd += ["-c:a", "libmp3lame", "-b:a", "320k"]
    cmd.append(str(target))

    job.detail = "Rendering"
    job.progress = 0.4
    await _run(cmd)

    if not target.exists():
        raise RuntimeError("ffmpeg produced no output")
    job.outputs["render"] = target
    return target
