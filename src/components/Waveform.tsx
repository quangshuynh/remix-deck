import { useCallback, useEffect, useRef } from 'react'
import type { RemixEngine } from '../audio/engine.ts'

interface WaveformProps {
  engine: RemixEngine
  /** Playhead position in source-buffer seconds. */
  position: number
  duration: number
  /** Changes when the loaded track changes, to force a redraw. */
  trackKey: string
  onSeek: (position: number) => void
}

const cssVar = (el: Element, name: string, fallback: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback

/**
 * Canvas waveform drawn from precomputed peaks, with a click-to-seek
 * playhead. Peaks come from the engine so the reduction is cached across
 * redraws rather than recomputed every frame.
 */
export function Waveform({ engine, position, duration, trackKey, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const width = wrap.clientWidth
    const height = wrap.clientHeight
    if (width === 0 || height === 0) return

    // Only the backing store is set here. Display size stays under CSS
    // control (width/height 100%), so the canvas can never be left pinned to
    // a stale pixel size if a redraw is missed.
    const dpr = window.devicePixelRatio || 1
    const targetW = Math.round(width * dpr)
    const targetH = Math.round(height * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const wave = cssVar(canvas, '--wave', '#6e747b')
    const wavePlayed = cssVar(canvas, '--wave-played', '#ffb000')
    const gridColor = cssVar(canvas, '--wave-grid', 'rgba(0,0,0,0.16)')
    const playhead = cssVar(canvas, '--accent', '#d8302a')

    const mid = height / 2

    // Light time grid behind the trace.
    ctx.strokeStyle = gridColor
    ctx.lineWidth = 1
    for (let i = 1; i < 8; i++) {
      const x = Math.round((width / 8) * i) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    const buckets = Math.max(1, Math.floor(width))
    const peaks = engine.peaks(buckets)
    if (!peaks) {
      ctx.strokeStyle = gridColor
      ctx.beginPath()
      ctx.moveTo(0, mid + 0.5)
      ctx.lineTo(width, mid + 0.5)
      ctx.stroke()
      return
    }

    const progress = duration > 0 ? position / duration : 0
    const playedX = progress * width

    for (let i = 0; i < peaks.buckets; i++) {
      const min = peaks.values[i * 2]
      const max = peaks.values[i * 2 + 1]
      const top = mid - max * mid * 0.92
      const bottom = mid - min * mid * 0.92

      ctx.strokeStyle = i <= playedX ? wavePlayed : wave
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(i + 0.5, top)
      ctx.lineTo(i + 0.5, Math.max(bottom, top + 1))
      ctx.stroke()
    }

    // Playhead last, so it sits on top of the trace.
    ctx.strokeStyle = playhead
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playedX, 0)
    ctx.lineTo(playedX, height)
    ctx.stroke()
  }, [engine, position, duration])

  // Always points at the newest draw, so the observer below can stay mounted
  // for the lifetime of the component instead of being torn down and rebuilt
  // every time the playhead moves.
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    draw()
  }, [draw, trackKey])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver(() => drawRef.current())
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  const seekFromClientX = (clientX: number) => {
    const wrap = wrapRef.current
    if (!wrap || duration === 0) return
    const rect = wrap.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onSeek(ratio * duration)
  }

  const nudge = (seconds: number) => {
    onSeek(Math.max(0, Math.min(duration, position + seconds)))
  }

  return (
    <div
      className="waveform"
      ref={wrapRef}
      role="slider"
      tabIndex={0}
      aria-label="Waveform, click or use arrow keys to seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${position.toFixed(1)} of ${duration.toFixed(1)} seconds`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        seekFromClientX(event.clientX)
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) seekFromClientX(event.clientX)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          nudge(event.shiftKey ? 10 : 2)
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          nudge(event.shiftKey ? -10 : -2)
        } else if (event.key === 'Home') {
          event.preventDefault()
          onSeek(0)
        } else if (event.key === 'End') {
          event.preventDefault()
          onSeek(duration)
        }
      }}
    >
      <canvas className="waveform__canvas" ref={canvasRef} />
    </div>
  )
}
