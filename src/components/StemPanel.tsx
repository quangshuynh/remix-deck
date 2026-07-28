import { useEffect, useRef, useState } from 'react'
import {
  checkHealth,
  fetchStem,
  startSeparation,
  waitForJob,
  type BackendHealth,
  type JobStatus,
} from '../audio/api.ts'

interface StemPanelProps {
  /** The file currently on the deck, if it came from the user's disk. */
  file: File | null
  trackName: string | null
  onStemLoaded: (file: File, label: string) => void
}

/**
 * Instrumental and Karaoke, the two things the browser cannot do. Separating
 * a finished mix into parts is a learned model, not a filter, so it runs on
 * the backend and the deck degrades gracefully when that is not running.
 */
export function StemPanel({ file, trackName, onStemLoaded }: StemPanelProps) {
  const [health, setHealth] = useState<BackendHealth | null | 'checking'>('checking')
  const [job, setJob] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cancelled = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    checkHealth(controller.signal).then(setHealth)
    return () => {
      controller.abort()
      cancelled.current = true
    }
  }, [])

  const separate = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    setJob(null)
    try {
      const started = await startSeparation(file)
      setJob(started)
      const finished = await waitForJob(started.id, (status) => {
        if (!cancelled.current) setJob(status)
      })
      if (finished.state === 'failed') {
        setError(finished.error ?? 'Separation failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the backend')
    } finally {
      setBusy(false)
    }
  }

  const loadStem = async (name: string) => {
    if (!job) return
    setError(null)
    try {
      const stem = await fetchStem(job.id, name)
      const label = name === 'instrumental' ? 'Instrumental' : 'Karaoke'
      onStemLoaded(stem, `${trackName ?? 'Track'} (${label})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the stem')
    }
  }

  const offline = health === null
  const percent = Math.round((job?.progress ?? 0) * 100)

  return (
    <section className="panel panel--stems" aria-label="Stems">
      <div className="panel__head">
        <h2 className="panel__title">Stems</h2>
        <span className={`lamp ${offline ? 'lamp--off' : health === 'checking' ? '' : 'lamp--on'}`}>
          {health === 'checking' ? 'Checking' : offline ? 'Backend offline' : 'Backend ready'}
        </span>
      </div>

      <p className="panel__note">
        Instrumental and Karaoke need a model to unmix the track, which no filter chain can
        do. This runs Demucs on the local backend.
      </p>

      {offline ? (
        <p className="stems__hint">
          Start it with <code>uvicorn app.main:app --port 8000</code> in <code>backend/</code>.
          Everything else on the deck works without it.
        </p>
      ) : (
        <>
          <div className="stems__actions">
            <button
              type="button"
              className="btn"
              onClick={() => void separate()}
              disabled={!file || busy || health === 'checking'}
            >
              {busy ? `Separating ${percent}%` : 'Separate stems'}
            </button>
            {job?.state === 'done' && (
              <>
                <button type="button" className="btn btn--ghost" onClick={() => void loadStem('instrumental')}>
                  Load instrumental
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => void loadStem('vocals')}>
                  Load vocals
                </button>
              </>
            )}
          </div>

          {!file && (
            <p className="stems__hint">
              Load a file from your disk first. The generated demo loop has nothing to unmix.
            </p>
          )}

          {busy && (
            <div className="stems__progress">
              <div className="stems__bar" style={{ width: `${percent}%` }} />
              <span className="stems__detail">{job?.detail ?? 'Starting'}</span>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="stems__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
