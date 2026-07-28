import { useRef, useState } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  onDemo: () => void
  hasTrack: boolean
}

const ACCEPTED = '.mp3,.wav,.m4a,.ogg,.flac,audio/*'
const EXTENSIONS = ['mp3', 'wav', 'm4a', 'ogg', 'flac']

function isSupported(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSIONS.includes(ext) || file.type.startsWith('audio/')
}

/**
 * Audio only ever comes from the user's own files. There is no URL field
 * here on purpose.
 */
export function DropZone({ onFile, onDemo, hasTrack }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)

  const accept = (file: File | undefined) => {
    if (!file) return
    if (!isSupported(file)) {
      setRejected(`${file.name} is not an audio file we can read.`)
      return
    }
    setRejected(null)
    onFile(file)
  }

  return (
    <div
      className={`drop ${dragging ? 'is-dragging' : ''} ${hasTrack ? 'is-compact' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        accept(event.dataTransfer.files[0])
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="drop__input"
        accept={ACCEPTED}
        onChange={(event) => {
          accept(event.target.files?.[0])
          // Allow re-picking the same file after a failed decode.
          event.target.value = ''
        }}
      />

      <div className="drop__body">
        <p className="drop__lead">
          {hasTrack ? 'Load another file' : 'Drop a file you own'}
        </p>
        <p className="drop__hint">MP3 · WAV · M4A · OGG · FLAC</p>
        <div className="drop__actions">
          <button type="button" className="btn btn--ghost" onClick={() => inputRef.current?.click()}>
            Choose file
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDemo}>
            Load demo loop
          </button>
        </div>
        <p className="drop__note">
          Files are decoded in your browser. Nothing is uploaded anywhere.
        </p>
        {rejected && (
          <p className="drop__error" role="alert">
            {rejected}
          </p>
        )}
      </div>
    </div>
  )
}
