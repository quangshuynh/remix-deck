import { semitonesForRate } from '../audio/presets.ts'
import type { EngineState, TrackInfo } from '../audio/types.ts'

interface ReadoutProps {
  track: TrackInfo | null
  state: EngineState
  /** Position in source-buffer seconds. */
  position: number
  rate: number
  presetName: string
  isEdited: boolean
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  const cs = Math.floor((seconds - total) * 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

const STATE_LABEL: Record<EngineState, string> = {
  empty: 'No track',
  loading: 'Decoding',
  ready: 'Ready',
  playing: 'Playing',
  rendering: 'Rendering',
}

/**
 * The amber LCD. Position is shown on the output timeline, since a slowed
 * track genuinely runs longer than the source file.
 */
export function Readout({
  track,
  state,
  position,
  rate,
  presetName,
  isEdited,
}: ReadoutProps) {
  const sourceDuration = track?.duration ?? 0
  const outputDuration = sourceDuration / rate
  const outputPosition = position / rate
  const semis = semitonesForRate(rate)

  return (
    <div className="lcd">
      <div className="lcd__row lcd__row--title">
        <span className="lcd__track" title={track?.name ?? ''}>
          {track ? track.name : 'INSERT MEDIA'}
        </span>
        <span className={`lcd__state lcd__state--${state}`}>{STATE_LABEL[state]}</span>
      </div>

      <div className="lcd__row lcd__row--time">
        <span className="lcd__clock">{clock(outputPosition)}</span>
        <span className="lcd__total">/ {clock(outputDuration)}</span>
      </div>

      <div className="lcd__row lcd__row--meta">
        <div className="lcd__cell">
          <span className="lcd__key">Preset</span>
          <span className="lcd__val">
            {presetName}
            {isEdited && <em className="lcd__edited"> +edit</em>}
          </span>
        </div>
        <div className="lcd__cell">
          <span className="lcd__key">Rate</span>
          <span className="lcd__val">{rate.toFixed(2)}x</span>
        </div>
        <div className="lcd__cell">
          <span className="lcd__key">Pitch</span>
          <span className="lcd__val">
            {semis > 0 ? '+' : ''}
            {semis.toFixed(2)} st
          </span>
        </div>
        <div className="lcd__cell">
          <span className="lcd__key">Source</span>
          <span className="lcd__val">
            {track ? `${(track.sampleRate / 1000).toFixed(1)}k · ${track.channels}ch` : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
