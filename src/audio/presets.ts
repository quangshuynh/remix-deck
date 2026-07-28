import type { ParamGroup, ParamSpec, Preset, RemixParams } from './types.ts'

export const DEFAULT_PARAMS: RemixParams = {
  rate: 1,
  bass: 0,
  air: 0,
  tone: 20000,
  cut: 20,
  wet: 0,
  decay: 2,
  rotate: 0,
  width: 0,
  punch: 0.15,
  gain: 0.9,
}

/** Builds a preset's params on top of the defaults, so entries stay readable. */
function params(overrides: Partial<RemixParams>): RemixParams {
  return { ...DEFAULT_PARAMS, ...overrides }
}

export const GROUP_LABELS: Record<ParamGroup, string> = {
  time: 'Time',
  weight: 'Weight',
  space: 'Space',
  texture: 'Texture',
}

export const GROUP_BLURBS: Record<ParamGroup, string> = {
  time: 'Speed and pitch, moved together',
  weight: 'Low end and density',
  space: 'Reverb and stereo movement',
  texture: 'Tone shaping and colour',
}

const hz = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`

export const PARAM_SPECS: ParamSpec[] = [
  {
    key: 'rate',
    label: 'Rate',
    group: 'time',
    min: 0.5,
    max: 1.6,
    step: 0.01,
    unit: 'x',
    format: (v) => `${v.toFixed(2)}x`,
  },
  {
    key: 'bass',
    label: 'Bass',
    group: 'weight',
    min: -12,
    max: 15,
    step: 0.5,
    unit: 'dB',
    format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`,
  },
  {
    key: 'punch',
    label: 'Punch',
    group: 'weight',
    min: 0,
    max: 1,
    step: 0.01,
    unit: '%',
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'gain',
    label: 'Output',
    group: 'weight',
    min: 0,
    max: 1.5,
    step: 0.01,
    unit: '%',
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'wet',
    label: 'Reverb',
    group: 'space',
    min: 0,
    max: 1,
    step: 0.01,
    unit: '%',
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'decay',
    label: 'Decay',
    group: 'space',
    min: 0.2,
    max: 8,
    step: 0.1,
    unit: 's',
    format: (v) => `${v.toFixed(1)}s`,
  },
  {
    key: 'rotate',
    label: 'Rotate',
    group: 'space',
    min: 0,
    max: 1.2,
    step: 0.01,
    unit: 'Hz',
    format: (v) => (v === 0 ? 'OFF' : `${v.toFixed(2)} Hz`),
  },
  {
    key: 'width',
    label: 'Width',
    group: 'space',
    min: 0,
    max: 1,
    step: 0.01,
    unit: '%',
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'cut',
    label: 'Body',
    group: 'texture',
    min: 20,
    max: 2000,
    step: 10,
    unit: 'Hz',
    format: (v) => (v <= 25 ? 'FULL' : `${hz(v)} Hz`),
  },
  {
    key: 'air',
    label: 'Air',
    group: 'texture',
    min: -12,
    max: 12,
    step: 0.5,
    unit: 'dB',
    format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`,
  },
  {
    key: 'tone',
    label: 'Tone',
    group: 'texture',
    min: 300,
    max: 20000,
    step: 100,
    unit: 'Hz',
    format: (v) => (v >= 19500 ? 'OPEN' : `${hz(v)} Hz`),
  },
]

export const PARAM_SPEC_BY_KEY = Object.fromEntries(
  PARAM_SPECS.map((spec) => [spec.key, spec]),
) as Record<keyof RemixParams, ParamSpec>

/**
 * Presets are nothing but parameter sets. Selecting one moves the visible
 * controls to match, so it is a starting point you can tweak rather than a
 * mode you are locked into.
 */
export const PRESETS: Preset[] = [
  {
    id: 'original',
    name: 'Original',
    group: 'time',
    blurb: 'Untouched. The reference point for A/B.',
    params: params({}),
  },
  {
    id: 'sped-up',
    name: 'Sped Up',
    group: 'time',
    blurb: 'The TikTok edit. Faster and a touch brighter.',
    params: params({ rate: 1.15, air: 1.5, punch: 0.25 }),
  },
  {
    id: 'nightcore',
    name: 'Nightcore',
    group: 'time',
    blurb: 'Hard speed lift, pitch rides along.',
    params: params({ rate: 1.28, bass: 2, air: 2.5, punch: 0.3 }),
  },
  {
    id: 'slowed',
    name: 'Slowed',
    group: 'time',
    blurb: 'Dropped a few percent, no reverb.',
    params: params({ rate: 0.85, bass: 2 }),
  },
  {
    id: 'slowed-reverb',
    name: 'Slowed + Reverb',
    group: 'time',
    blurb: 'The bedroom classic. Slow, wide, washed.',
    params: params({ rate: 0.82, bass: 3, wet: 0.38, decay: 3.2, air: 1 }),
  },
  {
    id: 'chopped-screwed',
    name: 'Chopped and Screwed',
    group: 'time',
    blurb: 'Houston tempo, syrup low end, rolled highs.',
    params: params({ rate: 0.72, bass: 6, tone: 9000, wet: 0.22, decay: 2.4, punch: 0.4 }),
  },
  {
    id: 'daycore',
    name: 'Daycore',
    group: 'time',
    blurb: 'Nightcore in reverse. Dragged well below tempo.',
    params: params({ rate: 0.62, bass: 4, wet: 0.3, decay: 3.5 }),
  },
  {
    id: 'sped-up-reverb',
    name: 'Sped Up + Reverb',
    group: 'time',
    blurb: 'Fast and roomy, the other half of the edit pair.',
    params: params({ rate: 1.16, air: 2, wet: 0.3, decay: 2.4, width: 0.2 }),
  },
  {
    id: 'hyperpop',
    name: 'Hyperpop',
    group: 'time',
    blurb: 'Pitched way up, bright and crushed.',
    params: params({ rate: 1.35, bass: 3, air: 6, punch: 0.7 }),
  },
  {
    id: 'trap',
    name: 'Trap',
    group: 'weight',
    blurb: 'Sub-heavy and slightly dragged, tuned for 808s.',
    params: params({ rate: 0.9, bass: 10, air: 2, punch: 0.6, gain: 0.95 }),
  },
  {
    id: 'rage',
    name: 'Rage',
    group: 'weight',
    blurb: 'Distorted-loud and bright. Playboi Carti territory.',
    params: params({ rate: 1.02, bass: 9, air: 6, punch: 0.8, wet: 0.15, decay: 1.5, gain: 1 }),
  },
  {
    id: 'bass-boosted',
    name: 'Bass Boosted',
    group: 'weight',
    blurb: 'Shelf lifted hard at 110 Hz, compressor holding it down.',
    params: params({ bass: 11, air: 1, punch: 0.7, gain: 0.8 }),
  },
  {
    id: 'club-mix',
    name: 'Club Mix',
    group: 'weight',
    blurb: 'Nudged up, weighted, and squeezed for a big room.',
    params: params({ rate: 1.06, bass: 6, air: 3, punch: 0.55, wet: 0.1, decay: 1.4 }),
  },
  {
    id: 'festival-mix',
    name: 'Festival Mix',
    group: 'weight',
    blurb: 'Wide, bright and loud, with a little air on the tail.',
    params: params({ rate: 1.09, bass: 5, air: 5, wet: 0.18, decay: 2, punch: 0.6, width: 0.3 }),
  },
  {
    id: 'hardstyle',
    name: 'Hardstyle Edit',
    group: 'weight',
    blurb: 'Fast, heavy and slammed flat.',
    params: params({ rate: 1.18, bass: 8, air: 4, punch: 0.85, gain: 1.05 }),
  },
  {
    id: '8d',
    name: '8D Audio',
    group: 'space',
    blurb: 'Slow stereo orbit. Wear headphones.',
    params: params({ wet: 0.3, decay: 2.6, rotate: 0.14, width: 0.95 }),
  },
  {
    id: 'chillstep',
    name: 'Chillstep',
    group: 'space',
    blurb: 'Gently slowed, deep and roomy.',
    params: params({ rate: 0.94, bass: 4, air: 2, wet: 0.35, decay: 3.6, width: 0.25 }),
  },
  {
    id: 'ambient-wash',
    name: 'Ambient Wash',
    group: 'space',
    blurb: 'Mostly reverb. The track becomes weather.',
    params: params({ rate: 0.8, wet: 0.72, decay: 6, tone: 6000, air: 3, width: 0.4, gain: 1 }),
  },
  {
    id: 'stadium',
    name: 'Stadium',
    group: 'space',
    blurb: 'Big bright room, long tail, wide.',
    params: params({ wet: 0.55, decay: 5.5, width: 0.35, air: 2, bass: 2 }),
  },
  {
    id: 'underwater',
    name: 'Underwater',
    group: 'space',
    blurb: 'Everything above 900 Hz is gone. Muffled and drifting.',
    params: params({ rate: 0.9, tone: 900, bass: 4, wet: 0.5, decay: 4, width: 0.3 }),
  },
  {
    id: 'plugg',
    name: 'Plugg',
    group: 'texture',
    blurb: 'Soft, hazy and slowed. Bells over a dulled top end.',
    params: params({ rate: 0.86, bass: 6, air: -1, tone: 8000, wet: 0.32, decay: 3 }),
  },
  {
    id: 'telephone',
    name: 'Telephone',
    group: 'texture',
    blurb: 'Bandpassed to a handset. Body gone, top gone.',
    // Bandpassing this hard throws away most of the energy, so the output gain
    // works much harder here than elsewhere just to stay level with Original.
    params: params({ cut: 420, tone: 3400, bass: -3, punch: 0.6, gain: 1.5 }),
  },
  {
    id: 'am-radio',
    name: 'AM Radio',
    group: 'texture',
    blurb: 'Narrow, squashed and a little harsh.',
    params: params({ cut: 300, tone: 4500, air: -3, punch: 0.65, gain: 1.05 }),
  },
  {
    id: 'lofi',
    name: 'Lo-fi',
    group: 'texture',
    blurb: 'Highs rolled off, tape-slow, small room.',
    params: params({ rate: 0.92, bass: 3, air: -6, tone: 3200, wet: 0.16, decay: 1.6 }),
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    group: 'texture',
    blurb: 'Mall music at three quarter speed.',
    params: params({ rate: 0.76, bass: 4, air: -2, tone: 7000, wet: 0.45, decay: 4.2, width: 0.3 }),
  },
  {
    id: 'memphis-phonk',
    name: 'Memphis Phonk',
    group: 'texture',
    blurb: 'Screwed tempo, murky top, heavy bottom.',
    params: params({ rate: 0.88, bass: 9, air: -3, tone: 6500, wet: 0.2, decay: 2.2, punch: 0.5 }),
  },
  {
    id: 'drift-phonk',
    name: 'Drift Phonk',
    group: 'texture',
    blurb: 'Cowbell fuel. Maximum low end, maximum squeeze.',
    params: params({ rate: 0.95, bass: 12, air: 2, punch: 0.9, wet: 0.12, decay: 1.8, gain: 1.1 }),
  },
  {
    id: 'witch-house',
    name: 'Witch House',
    group: 'texture',
    blurb: 'Very slow, very dark, very wet.',
    params: params({ rate: 0.68, bass: 7, air: -4, tone: 4500, wet: 0.55, decay: 5, width: 0.5 }),
  },
]

export const PRESET_BY_ID = Object.fromEntries(
  PRESETS.map((preset) => [preset.id, preset]),
) as Record<string, Preset>

/** Semitone offset produced by a playback rate, for the pitch readout. */
export function semitonesForRate(rate: number): number {
  return 12 * Math.log2(rate)
}

/**
 * True when the live params still match the preset exactly. Once a user turns
 * a knob the rack shows the preset as edited rather than selected.
 */
export function matchesPreset(current: RemixParams, preset: Preset): boolean {
  return (Object.keys(preset.params) as (keyof RemixParams)[]).every(
    (key) => Math.abs(current[key] - preset.params[key]) < 1e-6,
  )
}
