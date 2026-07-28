/**
 * A short loop generated from scratch so the deck is playable the moment it
 * loads, before anyone uploads anything. Four bars at 100 BPM over Am - F - C
 * - G: kick, hats, sub bass and a detuned pad. Written straight into an
 * AudioBuffer with maths, so there is no asset to ship.
 */

const BPM = 100
const BEATS_PER_BAR = 4
const BARS = 4

/** Semitone offsets from A2 (110 Hz) for each bar's chord. */
const PROGRESSION = [
  { root: 0, voicing: [0, 12, 16, 19] }, // Am
  { root: -4, voicing: [0, 12, 16, 21] }, // F
  { root: 3, voicing: [0, 12, 16, 19] }, // C
  { root: -2, voicing: [0, 12, 15, 19] }, // G
]

const noteHz = (semitonesFromA2: number) => 110 * Math.pow(2, semitonesFromA2 / 12)

export function createDemoBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const beatSeconds = 60 / BPM
  const barSeconds = beatSeconds * BEATS_PER_BAR
  const duration = barSeconds * BARS
  const frames = Math.floor(duration * sampleRate)
  const buffer = ctx.createBuffer(2, frames, sampleRate)
  const left = buffer.getChannelData(0)
  const right = buffer.getChannelData(1)

  const addSample = (index: number, l: number, r: number) => {
    if (index < 0 || index >= frames) return
    left[index] += l
    right[index] += r
  }

  // --- Pad: three detuned sines per chord tone, slow attack, slow release ---
  for (let bar = 0; bar < BARS; bar++) {
    const chord = PROGRESSION[bar]
    const startFrame = Math.floor(bar * barSeconds * sampleRate)
    const lengthFrames = Math.floor(barSeconds * sampleRate)

    for (const interval of chord.voicing) {
      const freq = noteHz(chord.root + interval)
      // Detune the pair slightly so the pad moves instead of sitting still.
      const detunes = [-0.12, 0, 0.12]
      for (let d = 0; d < detunes.length; d++) {
        const f = freq * Math.pow(2, detunes[d] / 12)
        const phase = Math.random() * Math.PI * 2
        // Spread the three voices across the stereo field.
        const pan = (d - 1) * 0.5
        const gainL = 0.055 * (1 - Math.max(0, pan))
        const gainR = 0.055 * (1 + Math.min(0, pan))

        for (let i = 0; i < lengthFrames; i++) {
          const t = i / sampleRate
          const norm = i / lengthFrames
          // Soft swell in, gentle fade at the bar edge.
          const env = Math.min(1, norm * 6) * Math.min(1, (1 - norm) * 8)
          const value = Math.sin(2 * Math.PI * f * t + phase) * env
          addSample(startFrame + i, value * gainL, value * gainR)
        }
      }
    }
  }

  // --- Kick: sine with a fast pitch drop, on every beat ---
  for (let beat = 0; beat < BARS * BEATS_PER_BAR; beat++) {
    const startFrame = Math.floor(beat * beatSeconds * sampleRate)
    const lengthFrames = Math.floor(0.32 * sampleRate)
    let phase = 0

    for (let i = 0; i < lengthFrames; i++) {
      const t = i / sampleRate
      // 120 Hz down to 45 Hz over about 60 ms is the classic thump.
      const freq = 45 + 75 * Math.exp(-t * 18)
      phase += (2 * Math.PI * freq) / sampleRate
      const env = Math.exp(-t * 9)
      const value = Math.sin(phase) * env * 0.72
      addSample(startFrame + i, value, value)
    }
  }

  // --- Sub bass: root of the bar, on the off-eighths ---
  for (let bar = 0; bar < BARS; bar++) {
    const chord = PROGRESSION[bar]
    const freq = noteHz(chord.root - 12)

    for (let eighth = 0; eighth < BEATS_PER_BAR * 2; eighth++) {
      if (eighth % 2 === 0) continue // let the kick have the downbeats
      const startSeconds = bar * barSeconds + eighth * (beatSeconds / 2)
      const startFrame = Math.floor(startSeconds * sampleRate)
      const lengthFrames = Math.floor(0.22 * sampleRate)

      for (let i = 0; i < lengthFrames; i++) {
        const t = i / sampleRate
        const env = Math.min(1, i / 400) * Math.exp(-t * 7)
        const value = Math.sin(2 * Math.PI * freq * t) * env * 0.3
        addSample(startFrame + i, value, value)
      }
    }
  }

  // --- Hats: filtered noise burst on every eighth, accented off-beat ---
  let hatState = 0
  for (let eighth = 0; eighth < BARS * BEATS_PER_BAR * 2; eighth++) {
    const startSeconds = eighth * (beatSeconds / 2)
    const startFrame = Math.floor(startSeconds * sampleRate)
    const lengthFrames = Math.floor(0.07 * sampleRate)
    const accent = eighth % 2 === 1 ? 1 : 0.55

    for (let i = 0; i < lengthFrames; i++) {
      const t = i / sampleRate
      const noise = Math.random() * 2 - 1
      // Crude one-pole highpass: subtracting the smoothed signal leaves the top.
      hatState += (noise - hatState) * 0.7
      const high = noise - hatState
      const env = Math.exp(-t * 60)
      const value = high * env * 0.16 * accent
      // Nudge the hats slightly right so the loop is not perfectly mono.
      addSample(startFrame + i, value * 0.85, value)
    }
  }

  // --- Normalise so the loop lands near -3 dBFS regardless of the maths above ---
  let peak = 0
  for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  }
  if (peak > 0) {
    const scale = 0.707 / peak
    for (let i = 0; i < frames; i++) {
      left[i] *= scale
      right[i] *= scale
    }
  }

  return buffer
}
