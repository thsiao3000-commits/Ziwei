import { DENSITIES, type Density } from '../settings/preferences';

/** 顯示密度：精簡、標準、完整。 */
export function DensityControl({ value, onChange }: { value: Density; onChange: (density: Density) => void }) {
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">顯示密度</legend>
      <span aria-hidden="true" className="text-sm text-ink-muted">
        密度
      </span>
      <div className="flex">
        {DENSITIES.map((option) => (
          <label
            key={option.value}
            title={option.hint}
            className="-ml-px cursor-pointer border border-line px-3 py-1 font-kai text-[0.9375rem] leading-normal first:ml-0 first:rounded-l-control last:rounded-r-control has-[:checked]:bg-accent has-[:checked]:text-accent-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
          >
            <input
              type="radio"
              name="density"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
