import type { ParamGroup, ParamSpec, RemixParams } from '../audio/types.ts'
import { GROUP_BLURBS, GROUP_LABELS } from '../audio/presets.ts'

interface ControlWellProps {
  group: ParamGroup
  specs: ParamSpec[]
  params: RemixParams
  onChange: (key: keyof RemixParams, value: number) => void
}

/**
 * One recessed well per parameter group. Selecting a preset moves these, so
 * they double as a readout of what the preset actually did.
 */
export function ControlWell({ group, specs, params, onChange }: ControlWellProps) {
  return (
    <section className="well" aria-labelledby={`well-${group}`}>
      <header className="well__head">
        <h3 className="well__title" id={`well-${group}`}>
          {GROUP_LABELS[group]}
        </h3>
        <p className="well__blurb">{GROUP_BLURBS[group]}</p>
      </header>

      <div className="well__controls">
        {specs.map((spec) => {
          const value = params[spec.key]
          const percent = ((value - spec.min) / (spec.max - spec.min)) * 100
          return (
            <div className="knob" key={spec.key}>
              <label className="knob__label" htmlFor={`param-${spec.key}`}>
                {spec.label}
              </label>
              <input
                id={`param-${spec.key}`}
                className="knob__input"
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value}
                aria-valuetext={spec.format(value)}
                style={{ ['--fill' as string]: `${percent}%` }}
                onChange={(event) => onChange(spec.key, Number(event.target.value))}
              />
              <output className="knob__value" htmlFor={`param-${spec.key}`}>
                {spec.format(value)}
              </output>
            </div>
          )
        })}
      </div>
    </section>
  )
}
