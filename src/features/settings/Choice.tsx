import { choiceClass, legendClass } from './ui';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  name: string;
  legend: string;
  hint?: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
};

/** 單選一組：用按鈕樣式的 radio，鍵盤與報讀器都照 radio 運作。 */
export function Choice<T extends string>({ name, legend, hint, value, options, onChange }: Props<T>) {
  return (
    <fieldset>
      <legend className={legendClass}>{legend}</legend>
      {hint && <p className="max-w-[34em] text-sm text-ink-muted">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className={choiceClass}>
            <input
              type="radio"
              name={name}
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
