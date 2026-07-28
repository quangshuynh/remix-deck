/**
 * Client for the Phase 2 backend. The deck works fully without it: this only
 * covers what the browser genuinely cannot do, which is unmixing a finished
 * stereo file into stems.
 */

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export interface JobStatus {
  id: string
  kind: 'separate' | 'render'
  state: 'queued' | 'running' | 'done' | 'failed'
  progress: number
  detail: string
  error: string | null
  outputs: string[]
  expires_in: number
}

export interface BackendHealth {
  status: string
  ffmpeg: boolean
  spotify_configured: boolean
  max_upload_mb: number
}

async function asError(response: Response): Promise<Error> {
  let detail = `${response.status} ${response.statusText}`
  try {
    const body = await response.json()
    if (body?.detail) detail = String(body.detail)
  } catch {
    // Non-JSON error body; the status line is all we have.
  }
  return new Error(detail)
}

/** Returns null when the backend is not running, rather than throwing. */
export async function checkHealth(signal?: AbortSignal): Promise<BackendHealth | null> {
  try {
    const response = await fetch(`${BASE}/health`, { signal })
    if (!response.ok) return null
    return (await response.json()) as BackendHealth
  } catch {
    return null
  }
}

export async function startSeparation(file: File): Promise<JobStatus> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${BASE}/separate`, { method: 'POST', body: form })
  if (!response.ok) throw await asError(response)
  return (await response.json()) as JobStatus
}

export async function getJob(id: string): Promise<JobStatus> {
  const response = await fetch(`${BASE}/jobs/${id}`)
  if (!response.ok) throw await asError(response)
  return (await response.json()) as JobStatus
}

export function jobFileUrl(id: string, name: string): string {
  return `${BASE}/jobs/${id}/files/${name}`
}

export async function fetchStem(id: string, name: string): Promise<File> {
  const response = await fetch(jobFileUrl(id, name))
  if (!response.ok) throw await asError(response)
  const blob = await response.blob()
  return new File([blob], `${name}.wav`, { type: 'audio/wav' })
}

/**
 * Polls until the job settles. Demucs runs for minutes, so the interval is
 * deliberately unhurried rather than hammering the server.
 */
export async function waitForJob(
  id: string,
  onProgress: (status: JobStatus) => void,
  intervalMs = 1500,
): Promise<JobStatus> {
  for (;;) {
    const status = await getJob(id)
    onProgress(status)
    if (status.state === 'done' || status.state === 'failed') return status
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
