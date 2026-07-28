import { PARAM_SPEC_BY_KEY, semitonesForRate } from '../audio/presets.ts'

interface PitchFaderProps {
  rate: number
  onChange: (rate: number) => void
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Formats the pitch shift as semitones and cents, the way a DJ mixer would. */
function formatShift(rate: number): string {
  const semis = semitonesForRate(rate)
  if (Math.abs(semis) < 0.005) return '0.00 st'
  return `${semis > 0 ? '+' : ''}${semis.toFixed(2)} st`
}

/** Where C lands after the shift, as a hint at the resulting key. */
function shiftedRoot(rate: number): string {
  const semis = semitonesForRate(rate)
  const index = ((Math.round(semis) % 12) + 12) % 12
  return NOTE_NAMES[index]
}

/**
 * The signature control: a vertical pitch fader. Rate is speed and pitch
 * together, exactly like a turntable, so this is one fader and not two.
 */
export function PitchFader({ rate, onChange }: PitchFaderProps) {
  const spec = PARAM_SPEC_BY_KEY.rate
  const percent = ((rate - spec.min) / (spec.max - spec.min)) * 100

  return (
    <div className="fader">
      <div className="fader__head">
        <span className="fader__title">Pitch</span>
        <span className="fader__pct">{formatShift(rate)}</span>
      </div>

      <div className="fader__body">
        <div className="fader__ticks" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (
            <span
              key={i}
              className={`fader__tick ${i === 5 ? 'fader__tick--centre' : ''}`}
            />
          ))}
        </div>

        <div className="fader__slot">
          {/* Fill above centre reads as +, below as -. */}
          <div className="fader__track" />
          <div
            className="fader__thumb"
            style={{ bottom: `calc(${percent}% - 17px)` }}
            aria-hidden="true"
          >
            <span className="fader__thumb-line" />
          </div>
          <input
            type="range"
            className="fader__input"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={rate}
            aria-label="Pitch fader, playback rate"
            aria-valuetext={`${rate.toFixed(2)} times speed, ${formatShift(rate)}`}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </div>

        <div className="fader__scale" aria-hidden="true">
          <span>+60</span>
          <span>0</span>
          <span>-50</span>
        </div>
      </div>

      <div className="fader__foot">
        <button
          type="button"
          className="fader__reset"
          onClick={() => onChange(1)}
          disabled={rate === 1}
        >
          Reset
        </button>
        <span className="fader__key" title="Where C lands at this rate">
          C &rarr; {shiftedRoot(rate)}
        </span>
      </div>
    </div>
  )
}
