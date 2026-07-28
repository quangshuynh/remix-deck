/**
 * The full parameter set for the deck. Everything the signal chain does is
 * derived from these ten numbers, so a preset is literally just one of these
 * and the export path reads the exact same object the live path does.
 */
export interface RemixParams {
  /** Playback rate. Speed and pitch move together, like a turntable pitch fader. */
  rate: number
  /** Lowshelf gain at 110 Hz, in dB. */
  bass: number
  /** Highshelf gain at 7 kHz, in dB. */
  air: number
  /** Lowpass cutoff in Hz. 20000 is effectively open. */
  tone: number
  /** Highpass cutoff in Hz. 20 is effectively open; raising it thins the body. */
  cut: number
  /** Reverb send, 0 dry to 1 fully wet. */
  wet: number
  /** Reverb decay in seconds. Drives the length of the generated impulse. */
  decay: number
  /** 8D rotation speed in Hz. 0 disables the panning oscillator. */
  rotate: number
  /** Rotation depth, 0 centre to 1 hard left-right. */
  width: number
  /** Compressor amount, 0 gentle to 1 slammed. */
  punch: number
  /** Master output gain, linear. */
  gain: number
}

export type ParamKey = keyof RemixParams

/** Which control well a parameter lives in. */
export type ParamGroup = 'time' | 'weight' | 'space' | 'texture'

export interface ParamSpec {
  key: ParamKey
  label: string
  group: ParamGroup
  min: number
  max: number
  step: number
  /** Units appended to the readout, e.g. 'dB' or 'Hz'. */
  unit: string
  /** Formats the raw value for the amber readout. */
  format: (value: number) => string
}

export interface Preset {
  id: string
  name: string
  group: ParamGroup
  /** One-line description of what it does to the sound. */
  blurb: string
  params: RemixParams
}

export type EngineState = 'empty' | 'loading' | 'ready' | 'playing' | 'rendering'

export interface TrackInfo {
  name: string
  /** Duration of the source material in seconds, before any rate change. */
  duration: number
  sampleRate: number
  channels: number
  /** True for the built-in generated loop, so the UI can label it. */
  isDemo: boolean
}
