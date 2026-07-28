import { createImpulseResponse } from './reverb.ts'
import type { RemixParams } from './types.ts'

/**
 * Handles on every node whose value a control can change. The live deck and
 * the offline renderer both build the chain through this module, so an export
 * cannot drift away from what was previewed.
 *
 * Chain order:
 *   source(playbackRate)
 *     > lowshelf 110 Hz (bass) > highshelf 7 kHz (air) > lowpass (tone)
 *     > split: dry gain + convolver into wet gain
 *     > sum > stereo panner (pan modulated by osc * depth for 8D)
 *     > compressor > master gain > destination
 */
export interface RemixChain {
  /** Connect the source node here. */
  input: AudioNode
  cut: BiquadFilterNode
  bass: BiquadFilterNode
  air: BiquadFilterNode
  tone: BiquadFilterNode
  dry: GainNode
  wet: GainNode
  convolver: ConvolverNode
  panner: StereoPannerNode
  rotor: OscillatorNode
  rotorDepth: GainNode
  compressor: DynamicsCompressorNode
  master: GainNode
  limiter: DynamicsCompressorNode
  /** Post-limiter taps for the meters. Absent on offline renders. */
  meters: { left: AnalyserNode; right: AnalyserNode } | null
}

export const BASS_FREQ = 110
export const AIR_FREQ = 7000

/**
 * The compressor is one control, not five. Turning Punch up lowers the
 * threshold, raises the ratio and tightens the timing together, which is how
 * a single "amount" knob on hardware behaves.
 */
export function compressorSettings(punch: number) {
  const amount = Math.max(0, Math.min(1, punch))
  return {
    threshold: -6 - amount * 28, // -6 dB down to -34 dB
    ratio: 2 + amount * 12, // 2:1 up to 14:1
    knee: 30 - amount * 24,
    attack: 0.01 - amount * 0.008,
    release: 0.3 - amount * 0.18,
    /** Rough make-up so heavy settings do not simply get quieter. */
    makeup: 1 + amount * 0.5,
  }
}

export function buildChain(
  ctx: BaseAudioContext,
  p: RemixParams,
  destination: AudioNode = ctx.destination,
  { withMeters = false }: { withMeters?: boolean } = {},
): RemixChain {
  // Highpass first: strip what is not wanted before the shelf boosts it. This
  // is what makes the radio and telephone presets possible.
  const cut = ctx.createBiquadFilter()
  cut.type = 'highpass'
  cut.frequency.value = p.cut
  cut.Q.value = 0.7

  const bass = ctx.createBiquadFilter()
  bass.type = 'lowshelf'
  bass.frequency.value = BASS_FREQ
  bass.gain.value = p.bass

  const air = ctx.createBiquadFilter()
  air.type = 'highshelf'
  air.frequency.value = AIR_FREQ
  air.gain.value = p.air

  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = p.tone
  tone.Q.value = 0.7

  const convolver = ctx.createConvolver()
  convolver.normalize = true
  convolver.buffer = createImpulseResponse(ctx, p.decay)

  const dry = ctx.createGain()
  const wet = ctx.createGain()
  // Equal-power crossfade, so sweeping Reverb does not dip in the middle.
  dry.gain.value = Math.cos((p.wet * Math.PI) / 2)
  wet.gain.value = Math.sin((p.wet * Math.PI) / 2)

  const sum = ctx.createGain()

  const panner = ctx.createStereoPanner()
  panner.pan.value = 0

  // The 8D effect: an LFO writing into the panner's pan AudioParam. Depth of
  // zero leaves it centred, so the oscillator can run harmlessly at all times.
  const rotor = ctx.createOscillator()
  rotor.type = 'sine'
  rotor.frequency.value = Math.max(0.0001, p.rotate)
  const rotorDepth = ctx.createGain()
  rotorDepth.gain.value = p.rotate > 0 ? p.width : 0
  rotor.connect(rotorDepth)
  rotorDepth.connect(panner.pan)

  const settings = compressorSettings(p.punch)
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = settings.threshold
  compressor.ratio.value = settings.ratio
  compressor.knee.value = settings.knee
  compressor.attack.value = settings.attack
  compressor.release.value = settings.release

  const master = ctx.createGain()
  master.gain.value = p.gain * settings.makeup

  // Safety limiter, last in the chain. Bass Boosted into a wet reverb can
  // otherwise push past 0 dBFS, which clips the export rather than sounding
  // loud. Fixed settings: this is a guard rail, not a control.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -1.5
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12

  cut.connect(bass)
  bass.connect(air)
  air.connect(tone)
  tone.connect(dry)
  tone.connect(convolver)
  convolver.connect(wet)
  dry.connect(sum)
  wet.connect(sum)
  sum.connect(panner)
  panner.connect(compressor)
  compressor.connect(master)
  master.connect(limiter)
  limiter.connect(destination)

  // Meters tap the very end of the chain, so they show what is actually
  // leaving the deck rather than what went into it.
  let meters: RemixChain['meters'] = null
  if (withMeters) {
    const splitter = ctx.createChannelSplitter(2)
    const left = ctx.createAnalyser()
    const right = ctx.createAnalyser()
    left.fftSize = 1024
    right.fftSize = 1024
    left.smoothingTimeConstant = 0.6
    right.smoothingTimeConstant = 0.6
    limiter.connect(splitter)
    splitter.connect(left, 0)
    splitter.connect(right, 1)
    meters = { left, right }
  }

  return {
    input: cut,
    cut,
    bass,
    air,
    tone,
    dry,
    wet,
    convolver,
    panner,
    rotor,
    rotorDepth,
    compressor,
    master,
    limiter,
    meters,
  }
}

/**
 * Applies params to an existing chain with setTargetAtTime rather than direct
 * assignment. Direct assignment steps the value on the next render quantum,
 * which is audible as a click; a short time constant ramps it instead.
 *
 * Decay is deliberately not handled here: changing it means regenerating the
 * impulse buffer, which cannot be automated and is handled by the engine.
 */
export function applyParams(
  chain: RemixChain,
  p: RemixParams,
  now: number,
  timeConstant = 0.02,
): void {
  const set = (param: AudioParam, value: number) => {
    param.setTargetAtTime(value, now, timeConstant)
  }

  set(chain.cut.frequency, p.cut)
  set(chain.bass.gain, p.bass)
  set(chain.air.gain, p.air)
  set(chain.tone.frequency, p.tone)
  set(chain.dry.gain, Math.cos((p.wet * Math.PI) / 2))
  set(chain.wet.gain, Math.sin((p.wet * Math.PI) / 2))
  set(chain.rotorDepth.gain, p.rotate > 0 ? p.width : 0)

  // Frequency below zero throws; keep the rotor running and mute it with depth.
  set(chain.rotor.frequency, Math.max(0.0001, p.rotate))

  // Recentre the panner when rotation is off, otherwise it freezes wherever
  // the LFO happened to stop.
  if (p.rotate === 0 || p.width === 0) {
    set(chain.panner.pan, 0)
  }

  const settings = compressorSettings(p.punch)
  set(chain.compressor.threshold, settings.threshold)
  set(chain.compressor.ratio, settings.ratio)
  set(chain.compressor.knee, settings.knee)
  set(chain.compressor.attack, settings.attack)
  set(chain.compressor.release, settings.release)
  set(chain.master.gain, p.gain * settings.makeup)
}
