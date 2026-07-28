import { GROUP_LABELS, PRESETS } from '../audio/presets.ts'
import type { ParamGroup, Preset } from '../audio/types.ts'

interface PresetRackProps {
  activeId: string
  isEdited: boolean
  onSelect: (preset: Preset) => void
}

const GROUP_ORDER: ParamGroup[] = ['time', 'weight', 'space', 'texture']

/** Presets grouped by what they actually change, not by vibe. */
export function PresetRack({ activeId, isEdited, onSelect }: PresetRackProps) {
  return (
    <div className="rack">
      {GROUP_ORDER.map((group) => {
        const presets = PRESETS.filter((preset) => preset.group === group)
        if (presets.length === 0) return null

        return (
          <section className="rack__group" key={group} aria-labelledby={`rack-${group}`}>
            <h3 className="rack__title" id={`rack-${group}`}>
              {GROUP_LABELS[group]}
            </h3>
            <div className="rack__buttons">
              {presets.map((preset) => {
                const active = preset.id === activeId
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`chip ${active ? 'is-active' : ''}`}
                    aria-pressed={active}
                    title={preset.blurb}
                    onClick={() => onSelect(preset)}
                  >
                    <span className="chip__lamp" aria-hidden="true" />
                    <span className="chip__name">{preset.name}</span>
                    {active && isEdited && <span className="chip__edited">EDIT</span>}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
