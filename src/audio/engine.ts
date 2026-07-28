import { createDemoBuffer } from './demo.ts'
import { applyParams, buildChain, type RemixChain } from './graph.ts'
import { computePeaks, type PeakData } from './peaks.ts'
import { DEFAULT_PARAMS } from './presets.ts'
import { createImpulseResponse } from './reverb.ts'
import type { EngineState, RemixParams, TrackInfo } from './types.ts'
import { baseName, encodeWav, safeFileName } from './wav.ts'

export interface EngineSnapshot {
  state: EngineState
  /** Position in source-buffer seconds, before the rate change. */
  position: number
  track: TrackInfo | null
  params: RemixParams
}

type Listener = (snapshot: EngineSnapshot) => void

/** Extra silence rendered after the source ends so the reverb tail is not cut off. */
const TAIL_PADDING = 0.4

/** Ceiling for exported files, -1 dBFS, leaving room for encoder overshoot. */
const EXPORT_CEILING = 0.891

/**
 * Scales a rendered buffer down if it still exceeds the ceiling. The chain's
 * limiter catches most of it, but a DynamicsCompressor has no lookahead, so
 * a sharp transient can slip past. Only ever attenuates: a quiet mix is left
 * alone rather than being normalised up.
 */
function trimPeaks(buffer: AudioBuffer): void {
  let peak = 0
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) {
      const value = Math.abs(data[i])
      if (value > peak) peak = value
    }
  }

  if (peak <= EXPORT_CEILING || peak === 0) return

  const scale = EXPORT_CEILING / peak
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) data[i] *= scale
  }
}

/**
 * The deck. Deliberately free of React imports so it can be driven from a
 * test or a script; the UI subscribes to it rather than owning it.
 */
export class RemixEngine {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private chain: RemixChain | null = null

  private paramsValue: RemixParams = { ...DEFAULT_PARAMS }
  private stateValue: EngineState = 'empty'
  private trackValue: TrackInfo | null = null

  /** Playhead in source-buffer seconds. */
  private positionValue = 0
  private lastTickTime = 0
  private rafHandle = 0
  private listeners = new Set<Listener>()
  private peakCache: { buckets: number; data: PeakData } | null = null
  private loopValue = false

  // --- subscription -------------------------------------------------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  snapshot(): EngineSnapshot {
    return {
      state: this.stateValue,
      position: this.positionValue,
      track: this.trackValue,
      params: { ...this.paramsValue },
    }
  }

  private emit(): void {
    const snap = this.snapshot()
    for (const listener of this.listeners) listener(snap)
  }

  private setState(state: EngineState): void {
    if (this.stateValue === state) return
    this.stateValue = state
    this.emit()
  }

  // --- context ------------------------------------------------------------

  /**
   * Browsers only allow an AudioContext to start inside a user gesture, so it
   * is created lazily on the first play or load rather than at construction.
   */
  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  async resume(): Promise<void> {
    const ctx = this.context()
    if (ctx.state === 'suspended') await ctx.resume()
  }

  get params(): RemixParams {
    return { ...this.paramsValue }
  }

  get track(): TrackInfo | null {
    return this.trackValue
  }

  get state(): EngineState {
    return this.stateValue
  }

  get loop(): boolean {
    return this.loopValue
  }

  set loop(value: boolean) {
    this.loopValue = value
    this.emit()
  }

  /** Source duration in seconds, before the rate change. */
  get duration(): number {
    return this.buffer?.duration ?? 0
  }

  /** How long the export will run for at the current rate. */
  get outputDuration(): number {
    return this.duration / this.paramsValue.rate
  }

  // --- loading ------------------------------------------------------------

  /** `displayName` overrides the filename, used when loading a separated stem. */
  async loadFile(file: File, displayName?: string): Promise<void> {
    this.setState('loading')
    try {
      const bytes = await file.arrayBuffer()
      const ctx = this.context()
      const decoded = await ctx.decodeAudioData(bytes)
      this.adoptBuffer(decoded, {
        name: displayName ?? baseName(file.name),
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        isDemo: false,
      })
    } catch (error) {
      this.setState(this.buffer ? 'ready' : 'empty')
      throw new Error(
        `Could not decode "${file.name}". The browser may not support this codec.`,
        { cause: error },
      )
    }
  }

  /** Loads the built-in generated loop so the deck works before any upload. */
  loadDemo(): void {
    const ctx = this.context()
    const demo = createDemoBuffer(ctx)
    this.adoptBuffer(demo, {
      name: 'Deck Demo Loop',
      duration: demo.duration,
      sampleRate: demo.sampleRate,
      channels: demo.numberOfChannels,
      isDemo: true,
    })
  }

  private adoptBuffer(buffer: AudioBuffer, info: TrackInfo): void {
    this.stop()
    this.buffer = buffer
    this.trackValue = info
    this.positionValue = 0
    this.peakCache = null
    this.setState('ready')
    this.emit()
  }

  // --- waveform -----------------------------------------------------------

  peaks(buckets: number): PeakData | null {
    if (!this.buffer) return null
    if (this.peakCache && this.peakCache.buckets === buckets) return this.peakCache.data
    const data = computePeaks(this.buffer, buckets)
    this.peakCache = { buckets, data }
    return data
  }

  // --- transport ----------------------------------------------------------

  async play(): Promise<void> {
    if (!this.buffer || this.stateValue === 'rendering') return
    await this.resume()

    // Restart from the top if the previous run finished at the end.
    if (this.positionValue >= this.buffer.duration - 1e-3) this.positionValue = 0

    this.startSource(this.positionValue)
    this.setState('playing')
    this.startTicking()
  }

  pause(): void {
    if (this.stateValue !== 'playing') return
    this.teardownSource()
    this.stopTicking()
    this.setState('ready')
  }

  stop(): void {
    this.teardownSource()
    this.stopTicking()
    this.positionValue = 0
    if (this.stateValue === 'playing') this.setState('ready')
    this.emit()
  }

  /** Seeks to a position in source-buffer seconds. */
  seek(position: number): void {
    if (!this.buffer) return
    const clamped = Math.max(0, Math.min(this.buffer.duration, position))
    this.positionValue = clamped

    if (this.stateValue === 'playing') {
      // A source node cannot be repositioned, so it is replaced.
      this.teardownSource()
      this.startSource(clamped)
      this.lastTickTime = this.context().currentTime
    }
    this.emit()
  }

  private startSource(offset: number): void {
    if (!this.buffer) return
    const ctx = this.context()

    const chain = buildChain(ctx, this.paramsValue, ctx.destination, { withMeters: true })
    const source = ctx.createBufferSource()
    source.buffer = this.buffer
    source.playbackRate.value = this.paramsValue.rate
    source.connect(chain.input)

    chain.rotor.start()
    source.start(0, offset)

    source.onended = () => {
      // Fires on manual teardown too, so only react if this is still current.
      if (this.source !== source) return
      if (this.loopValue) {
        this.teardownSource()
        this.positionValue = 0
        this.startSource(0)
        this.lastTickTime = this.context().currentTime
        return
      }
      this.teardownSource()
      this.stopTicking()
      this.positionValue = this.buffer?.duration ?? 0
      this.setState('ready')
      this.emit()
    }

    this.source = source
    this.chain = chain
    this.lastTickTime = ctx.currentTime
  }

  private teardownSource(): void {
    if (this.source) {
      this.source.onended = null
      try {
        this.source.stop()
      } catch {
        // Already stopped; nothing to do.
      }
      this.source.disconnect()
      this.source = null
    }
    if (this.chain) {
      try {
        this.chain.rotor.stop()
      } catch {
        // Already stopped.
      }
      this.chain.rotor.disconnect()
      this.chain.master.disconnect()
      this.chain.limiter.disconnect()
      this.chain = null
    }
  }

  // --- position tracking --------------------------------------------------

  /**
   * Advances the playhead by elapsed context time multiplied by the current
   * rate. Tracking it this way rather than from a fixed start offset keeps
   * the position correct when the rate is changed mid playback.
   */
  private startTicking(): void {
    if (this.rafHandle) return
    const tick = () => {
      this.rafHandle = requestAnimationFrame(tick)
      if (this.stateValue !== 'playing' || !this.buffer) return

      const ctx = this.context()
      const now = ctx.currentTime
      const delta = now - this.lastTickTime
      this.lastTickTime = now

      this.positionValue = Math.min(
        this.buffer.duration,
        this.positionValue + delta * this.paramsValue.rate,
      )
      this.emit()
    }
    this.rafHandle = requestAnimationFrame(tick)
  }

  private stopTicking(): void {
    if (!this.rafHandle) return
    cancelAnimationFrame(this.rafHandle)
    this.rafHandle = 0
  }

  // --- metering -----------------------------------------------------------

  private meterBuffer = new Float32Array(1024)

  /**
   * Current output level per channel as linear RMS, 0 to 1. Returns silence
   * when stopped so the meters fall rather than freezing at the last value.
   */
  levels(): { left: number; right: number } {
    const meters = this.chain?.meters
    if (!meters || this.stateValue !== 'playing') return { left: 0, right: 0 }

    const read = (analyser: AnalyserNode) => {
      analyser.getFloatTimeDomainData(this.meterBuffer)
      let sum = 0
      for (let i = 0; i < this.meterBuffer.length; i++) {
        sum += this.meterBuffer[i] * this.meterBuffer[i]
      }
      return Math.sqrt(sum / this.meterBuffer.length)
    }

    return { left: read(meters.left), right: read(meters.right) }
  }

  // --- parameters ---------------------------------------------------------

  setParams(next: Partial<RemixParams>): void {
    const previous = this.paramsValue
    this.paramsValue = { ...previous, ...next }

    if (this.chain && this.ctx) {
      const now = this.ctx.currentTime
      applyParams(this.chain, this.paramsValue, now)

      if (this.source && next.rate !== undefined && next.rate !== previous.rate) {
        this.source.playbackRate.setTargetAtTime(next.rate, now, 0.02)
      }

      // Decay changes the impulse buffer, which cannot be ramped. Swapping it
      // under a live signal clicks, so duck the wet path across the swap.
      if (next.decay !== undefined && next.decay !== previous.decay) {
        this.swapImpulse(this.paramsValue.decay)
      }
    }

    this.emit()
  }

  private swapImpulse(decay: number): void {
    const chain = this.chain
    const ctx = this.ctx
    if (!chain || !ctx) return

    const now = ctx.currentTime
    const target = Math.sin((this.paramsValue.wet * Math.PI) / 2)

    chain.wet.gain.cancelScheduledValues(now)
    chain.wet.gain.setTargetAtTime(0, now, 0.01)

    window.setTimeout(() => {
      if (this.chain !== chain) return
      chain.convolver.buffer = createImpulseResponse(ctx, decay)
      chain.wet.gain.setTargetAtTime(target, ctx.currentTime, 0.02)
    }, 40)
  }

  applyPreset(params: RemixParams): void {
    this.setParams(params)
  }

  // --- export -------------------------------------------------------------

  /**
   * Rebuilds the identical chain inside an OfflineAudioContext and renders
   * faster than real time. The output is as long as the rate-adjusted source
   * plus a reverb tail, so nothing gets truncated.
   */
  async render(): Promise<Blob> {
    if (!this.buffer) throw new Error('Nothing loaded to render.')

    const wasPlaying = this.stateValue === 'playing'
    if (wasPlaying) this.pause()
    this.setState('rendering')

    try {
      const p = this.paramsValue
      const sampleRate = this.buffer.sampleRate
      const tail = p.wet > 0 ? p.decay + TAIL_PADDING : 0.05
      const seconds = this.buffer.duration / p.rate + tail
      const frames = Math.ceil(seconds * sampleRate)

      const offline = new OfflineAudioContext(2, frames, sampleRate)
      const chain = buildChain(offline, p)

      const source = offline.createBufferSource()
      source.buffer = this.buffer
      source.playbackRate.value = p.rate
      source.connect(chain.input)

      chain.rotor.start(0)
      source.start(0)

      const rendered = await offline.startRendering()
      trimPeaks(rendered)
      return encodeWav(rendered)
    } finally {
      this.setState('ready')
    }
  }

  /** `Track Name (Preset Name).wav` */
  exportFileName(presetName: string): string {
    const track = safeFileName(this.trackValue?.name ?? 'Untitled')
    return `${track} (${safeFileName(presetName)}).wav`
  }

  async renderAndDownload(presetName: string): Promise<void> {
    const blob = await this.render()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = this.exportFileName(presetName)
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoking immediately can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  dispose(): void {
    this.stop()
    this.listeners.clear()
    void this.ctx?.close()
    this.ctx = null
  }
}
