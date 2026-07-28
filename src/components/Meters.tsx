import { useEffect, useRef } from 'react'
import type { RemixEngine } from '../audio/engine.ts'

interface MetersProps {
  engine: RemixEngine
  playing: boolean
}

/** RMS to a 0-1 bar position across a -48 to 0 dBFS scale. */
function toScale(rms: number): number {
  if (rms <= 0.0001) return 0
  const db = 20 * Math.log10(rms)
  return Math.max(0, Math.min(1, (db + 48) / 48))
}

/**
 * Stereo output meters, read from analysers at the end of the chain so they
 * show what is actually leaving the deck. Peak-hold pips fall back slowly,
 * the way a hardware meter behaves.
 */
export function Meters({ engine, playing }: MetersProps) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const leftPeakRef = useRef<HTMLDivElement>(null)
  const rightPeakRef = useRef<HTMLDivElement>(null)
  const peaks = useRef({ left: 0, right: 0 })
  const playingRef = useRef(playing)
  playingRef.current = playing

  useEffect(() => {
    let handle = 0

    const frame = () => {
      handle = requestAnimationFrame(frame)
      const { left, right } = engine.levels()
      const l = toScale(left)
      const r = toScale(right)

      // Peak hold decays about 40% of the scale per second.
      peaks.current.left = Math.max(l, peaks.current.left - 0.007)
      peaks.current.right = Math.max(r, peaks.current.right - 0.007)
      if (!playingRef.current) {
        peaks.current.left = Math.max(0, peaks.current.left - 0.02)
        peaks.current.right = Math.max(0, peaks.current.right - 0.02)
      }

      if (leftRef.current) leftRef.current.style.transform = `scaleX(${l})`
      if (rightRef.current) rightRef.current.style.transform = `scaleX(${r})`
      if (leftPeakRef.current) leftPeakRef.current.style.left = `${peaks.current.left * 100}%`
      if (rightPeakRef.current) rightPeakRef.current.style.left = `${peaks.current.right * 100}%`
    }

    // Not gated on prefers-reduced-motion: the movement here *is* the reading,
    // not decoration. A frozen meter would be a broken meter.
    handle = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(handle)
  }, [engine])

  return (
    <div className="meters" aria-hidden="true">
      <span className="meters__label">Out</span>
      <div className="meters__stack">
        {(['L', 'R'] as const).map((side, index) => (
          <div className="meters__row" key={side}>
            <span className="meters__side">{side}</span>
            <div className="meters__track">
              <div
                className="meters__fill"
                ref={index === 0 ? leftRef : rightRef}
              />
              <div
                className="meters__peak"
                ref={index === 0 ? leftPeakRef : rightPeakRef}
              />
              <div className="meters__ticks" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
