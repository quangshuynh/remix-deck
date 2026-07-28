import { useEffect, useRef } from 'react'

interface PlatterProps {
  rate: number
  spinning: boolean
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * The turntable platter. Rotation speed tracks the playback rate, so the
 * pitch fader has a visible consequence: pull it down and you watch the
 * record slow.
 */
export function Platter({ rate, spinning }: PlatterProps) {
  const discRef = useRef<HTMLDivElement>(null)
  const angleRef = useRef(0)
  const lastRef = useRef(0)
  const rafRef = useRef(0)

  // Refs rather than deps so the animation loop is never torn down mid-spin.
  const rateRef = useRef(rate)
  const spinningRef = useRef(spinning)
  rateRef.current = rate
  spinningRef.current = spinning

  useEffect(() => {
    const reduced = window.matchMedia(REDUCED_MOTION)
    if (reduced.matches) return

    const step = (now: number) => {
      rafRef.current = requestAnimationFrame(step)
      const last = lastRef.current || now
      const delta = (now - last) / 1000
      lastRef.current = now

      if (spinningRef.current) {
        // 33 1/3 rpm scaled by rate, the same relationship as a real deck.
        angleRef.current += delta * 200 * rateRef.current
      }
      if (discRef.current) {
        discRef.current.style.transform = `rotate(${angleRef.current}deg)`
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const rpm = (33.33 * rate).toFixed(1)

  return (
    <div className="platter">
      <div className="platter__well">
        <div className="platter__disc" ref={discRef}>
          <div className="platter__grooves" />
          <div className="platter__label">
            <span className="platter__label-text">REMIX</span>
            <span className="platter__label-text">DECK</span>
          </div>
          {/* Strobe dots on the rim, like the edge of a 1200. */}
          <div className="platter__strobe" />
          <div className="platter__marker" />
        </div>
        <div className="platter__spindle" />
      </div>
      <div className="platter__readout">
        <span className="platter__rpm">{rpm}</span>
        <span className="platter__rpm-unit">RPM</span>
      </div>
    </div>
  )
}
