/**
 * Procedural impulse response. No IR files to download: a stereo noise burst
 * shaped by an exponential decay envelope is enough to read as a real room,
 * and generating it means Decay is a continuous control rather than a
 * dropdown of canned spaces.
 */
export function createImpulseResponse(
  ctx: BaseAudioContext,
  decaySeconds: number,
): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.max(1, Math.floor(sampleRate * Math.max(0.05, decaySeconds)))
  const impulse = ctx.createBuffer(2, length, sampleRate)

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)

    // A one-pole lowpass over the noise takes the fizz off the tail, which is
    // what separates "reverb" from "white noise fading out".
    let smoothed = 0
    for (let i = 0; i < length; i++) {
      const t = i / length
      const noise = Math.random() * 2 - 1
      smoothed += (noise - smoothed) * 0.42

      // exp(-5t) lands the tail around -43 dB at the end of the buffer.
      const envelope = Math.exp(-5 * t)

      // Thin the early samples slightly so the attack is a burst, not a click.
      const onset = i < 64 ? i / 64 : 1

      data[i] = smoothed * envelope * onset
    }
  }

  return impulse
}
