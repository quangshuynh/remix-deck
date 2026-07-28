/**
 * 16 bit PCM WAV encoder. The Web Audio API renders to an AudioBuffer of
 * floats; browsers will not hand us an encoded file, so we write the RIFF
 * header and interleave the samples ourselves.
 */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels)
  const frames = buffer.length
  const sampleRate = buffer.sampleRate
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataBytes = frames * blockAlign

  const arrayBuffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(arrayBuffer)

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeString(8, 'WAVE')

  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // format: PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 8 * bytesPerSample, true)

  writeString(36, 'data')
  view.setUint32(40, dataBytes, true)

  const channelData: Float32Array[] = []
  for (let c = 0; c < channels; c++) {
    channelData.push(buffer.getChannelData(c))
  }

  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      // Clamp before scaling, otherwise anything over 0 dBFS wraps around and
      // turns into loud digital hash instead of clipping.
      const sample = Math.max(-1, Math.min(1, channelData[c][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += bytesPerSample
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

/** Strips the extension so exports read "Song (Nightcore).wav", not "Song.mp3 (Nightcore).wav". */
export function baseName(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '')
}

/** Characters Windows or macOS reject in a filename. */
const ILLEGAL_FILENAME_CHARS = new Set('<>:"/\\|?*')

/**
 * Strips characters the filesystem rejects, plus control codes. Spaces and
 * hyphens are legal and users expect them, so they stay.
 */
export function safeFileName(name: string): string {
  let out = ''
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) continue
    if (ILLEGAL_FILENAME_CHARS.has(char)) continue
    out += char
  }
  const cleaned = out.replace(/\s+/g, ' ').trim()
  return cleaned || 'Untitled'
}
