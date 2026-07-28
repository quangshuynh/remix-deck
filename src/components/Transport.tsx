import type { EngineState } from '../audio/types.ts'

interface TransportProps {
  state: EngineState
  loop: boolean
  canPlay: boolean
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onToggleLoop: () => void
  onRender: () => void
}

export function Transport({
  state,
  loop,
  canPlay,
  onPlay,
  onPause,
  onStop,
  onToggleLoop,
  onRender,
}: TransportProps) {
  const playing = state === 'playing'
  const rendering = state === 'rendering'
  const busy = rendering || state === 'loading'

  return (
    <div className="transport">
      <button
        type="button"
        className="btn btn--play"
        onClick={playing ? onPause : onPlay}
        disabled={!canPlay || busy}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        <span className="btn__glyph" aria-hidden="true">
          {playing ? '❚❚' : '▶'}
        </span>
        <span className="btn__text">{playing ? 'Pause' : 'Play'}</span>
      </button>

      <button
        type="button"
        className="btn"
        onClick={onStop}
        disabled={!canPlay || busy}
        aria-label="Stop"
      >
        <span className="btn__glyph" aria-hidden="true">
          ■
        </span>
        <span className="btn__text">Stop</span>
      </button>

      <button
        type="button"
        className={`btn btn--toggle ${loop ? 'is-on' : ''}`}
        onClick={onToggleLoop}
        disabled={!canPlay}
        aria-pressed={loop}
      >
        <span className="btn__glyph" aria-hidden="true">
          ↻
        </span>
        <span className="btn__text">Loop</span>
      </button>

      <button
        type="button"
        className="btn btn--render"
        onClick={onRender}
        disabled={!canPlay || busy}
      >
        <span className="btn__glyph" aria-hidden="true">
          {rendering ? '◐' : '↓'}
        </span>
        <span className="btn__text">
          {rendering ? 'Rendering' : 'Render WAV'}
        </span>
      </button>
    </div>
  )
}
