import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RemixEngine, type EngineSnapshot } from './audio/engine.ts'
import { DEFAULT_PARAMS, PRESETS, matchesPreset } from './audio/presets.ts'
import type { Preset, RemixParams } from './audio/types.ts'

/**
 * Thin React binding over the engine. The engine owns all audio state; this
 * only mirrors its snapshots into render state and exposes callbacks.
 */
export function useEngine() {
  const engine = useMemo(() => new RemixEngine(), [])
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => engine.snapshot())
  const [presetId, setPresetId] = useState('original')
  const [error, setError] = useState<string | null>(null)
  const [loop, setLoopState] = useState(false)
  const bootstrapped = useRef(false)

  useEffect(() => engine.subscribe(setSnapshot), [engine])

  useEffect(() => {
    return () => {
      engine.dispose()
    }
  }, [engine])

  const loadDemo = useCallback(() => {
    try {
      engine.loadDemo()
      setError(null)
      bootstrapped.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the demo loop.')
    }
  }, [engine])

  const loadFile = useCallback(
    async (file: File) => {
      try {
        await engine.loadFile(file)
        setError(null)
        bootstrapped.current = true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that file.')
      }
    },
    [engine],
  )

  const setParam = useCallback(
    (key: keyof RemixParams, value: number) => {
      engine.setParams({ [key]: value })
    },
    [engine],
  )

  const applyPreset = useCallback(
    (preset: Preset) => {
      engine.applyPreset(preset.params)
      setPresetId(preset.id)
    },
    [engine],
  )

  const reset = useCallback(() => {
    engine.applyPreset({ ...DEFAULT_PARAMS })
    setPresetId('original')
  }, [engine])

  const toggleLoop = useCallback(() => {
    const next = !engine.loop
    engine.loop = next
    setLoopState(next)
  }, [engine])

  const play = useCallback(() => {
    void engine.play()
  }, [engine])

  const pause = useCallback(() => engine.pause(), [engine])
  const stop = useCallback(() => engine.stop(), [engine])
  const seek = useCallback((position: number) => engine.seek(position), [engine])

  const activePreset = useMemo(
    () => PRESETS.find((preset) => preset.id === presetId) ?? PRESETS[0],
    [presetId],
  )

  // Once a knob moves the params no longer match, so the rack shows the
  // preset as a starting point that has been edited rather than as selected.
  const isEdited = useMemo(
    () => !matchesPreset(snapshot.params, activePreset),
    [snapshot.params, activePreset],
  )

  const download = useCallback(async () => {
    try {
      const label = isEdited ? `${activePreset.name} Edit` : activePreset.name
      await engine.renderAndDownload(label)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed.')
    }
  }, [engine, activePreset, isEdited])

  return {
    engine,
    ...snapshot,
    loop,
    error,
    setError,
    activePreset,
    isEdited,
    loadDemo,
    loadFile,
    setParam,
    applyPreset,
    reset,
    play,
    pause,
    stop,
    seek,
    toggleLoop,
    download,
  }
}
