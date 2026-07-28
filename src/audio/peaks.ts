/**
 * Min/max peak pairs for the waveform canvas. Drawing every sample would be
 * both slow and wrong at typical widths, so we reduce to one vertical bar per
 * pixel column and keep the extremes rather than an average, which is what
 * makes a waveform look like a waveform.
 */
export interface PeakData {
  /** Interleaved [min, max, min, max, ...], length = buckets * 2. */
  values: Float32Array
  buckets: number
}

export function computePeaks(buffer: AudioBuffer, buckets: number): PeakData {
  const count = Math.max(1, Math.floor(buckets))
  const values = new Float32Array(count * 2)
  const channels = buffer.numberOfChannels
  const frames = buffer.length
  const framesPerBucket = frames / count

  const data: Float32Array[] = []
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c))

  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * framesPerBucket)
    const end = Math.min(frames, Math.floor((i + 1) * framesPerBucket))

    let min = 0
    let max = 0
    for (let f = start; f < end; f++) {
      // Collapse channels to mono for display; a stereo split waveform reads
      // as noise at this size.
      let sum = 0
      for (let c = 0; c < channels; c++) sum += data[c][f]
      const sample = sum / channels
      if (sample < min) min = sample
      if (sample > max) max = sample
    }

    values[i * 2] = min
    values[i * 2 + 1] = max
  }

  return { values, buckets: count }
}
