import { useEffect, useMemo } from 'react'
import { PARAM_SPECS } from './audio/presets.ts'
import type { ParamGroup } from './audio/types.ts'
import { ControlWell } from './components/ControlWell.tsx'
import { DropZone } from './components/DropZone.tsx'
import { PitchFader } from './components/PitchFader.tsx'
import { Platter } from './components/Platter.tsx'
import { PresetRack } from './components/PresetRack.tsx'
import { Readout } from './components/Readout.tsx'
import { Transport } from './components/Transport.tsx'
import { Waveform } from './components/Waveform.tsx'
import { useEngine } from './useEngine.ts'
import './App.css'

const WELL_ORDER: ParamGroup[] = ['time', 'weight', 'space', 'texture']

export default function App() {
  const deck = useEngine()
  const {
    engine,
    state,
    track,
    position,
    params,
    loop,
    error,
    activePreset,
    isEdited,
  } = deck

  // Load the generated loop up front so the deck is usable before any upload.
  // The context stays suspended until a real gesture, which browsers require.
  useEffect(() => {
    if (!track) deck.loadDemo()
    // Intentionally only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const specsByGroup = useMemo(() => {
    const map = {} as Record<ParamGroup, typeof PARAM_SPECS>
    for (const group of WELL_ORDER) {
      map[group] = PARAM_SPECS.filter((spec) => spec.group === group)
    }
    return map
  }, [])

  // Space bar as play/pause, the way every audio tool works, but not while
  // the user is inside a control.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|BUTTON|TEXTAREA|SELECT)$/.test(target.tagName)) return
      event.preventDefault()
      if (state === 'playing') deck.pause()
      else deck.play()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, deck])

  const canPlay = Boolean(track) && state !== 'loading'

  return (
    <div className="deck">
      <header className="deck__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <div className="brand__text">
            <h1 className="brand__name">Remix Deck</h1>
            <p className="brand__sub">Turntable DSP · Web Audio</p>
          </div>
        </div>
        <p className="deck__notice">
          Load a song <strong>you own</strong>. Everything runs locally in your browser.
        </p>
      </header>

      {error && (
        <div className="deck__error" role="alert">
          {error}
          <button type="button" className="deck__error-close" onClick={() => deck.setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <main className="deck__main">
        <section className="panel panel--transport" aria-label="Transport">
          <div className="deck__platter">
            <Platter rate={params.rate} spinning={state === 'playing'} />
            <PitchFader rate={params.rate} onChange={(rate) => deck.setParam('rate', rate)} />
          </div>

          <div className="deck__centre">
            <Readout
              track={track}
              state={state}
              position={position}
              rate={params.rate}
              presetName={activePreset.name}
              isEdited={isEdited}
            />

            <Waveform
              engine={engine}
              position={position}
              duration={track?.duration ?? 0}
              trackKey={track?.name ?? 'none'}
              onSeek={deck.seek}
            />

            <Transport
              state={state}
              loop={loop}
              canPlay={canPlay}
              onPlay={deck.play}
              onPause={deck.pause}
              onStop={deck.stop}
              onToggleLoop={deck.toggleLoop}
              onRender={() => void deck.download()}
            />

            <DropZone onFile={(file) => void deck.loadFile(file)} onDemo={deck.loadDemo} hasTrack={Boolean(track)} />
          </div>
        </section>

        <section className="panel panel--presets" aria-label="Presets">
          <div className="panel__head">
            <h2 className="panel__title">Presets</h2>
            <button type="button" className="btn btn--ghost btn--small" onClick={deck.reset}>
              Reset all
            </button>
          </div>
          <p className="panel__note">
            A preset is a set of parameter values. Picking one moves the controls below, so it
            is a starting point, not a lock.
          </p>
          <PresetRack activeId={activePreset.id} isEdited={isEdited} onSelect={deck.applyPreset} />
        </section>

        <section className="panel panel--controls" aria-label="Controls">
          <div className="panel__head">
            <h2 className="panel__title">Signal chain</h2>
          </div>
          <div className="wells">
            {WELL_ORDER.map((group) => (
              <ControlWell
                key={group}
                group={group}
                specs={specsByGroup[group]}
                params={params}
                onChange={deck.setParam}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="deck__footer">
        <p>
          Rate changes speed and pitch together, like a turntable pitch fader. Export renders
          offline and downloads a 16 bit WAV.
        </p>
      </footer>
    </div>
  )
}
