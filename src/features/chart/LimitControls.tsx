import type { Limits, LimitSelection } from './types';

type Props = {
  limits: Limits;
  onChange: (selection: LimitSelection) => void;
  /** 跳到今天所在的大限與流年 */
  onToday: () => void;
};

/** 運限切換：大限 → 流年 → 流月。選取後，盤上各宮疊上運限宮名、運限四化與流曜。 */
export function LimitControls({ limits, onChange, onToday }: Props) {
  const { selection } = limits;
  const none = selection.decadal === null;

  return (
    <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" role="group" aria-label="運限">
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-[2.5em] shrink-0 font-kai text-ink-muted">大限</span>
        <div className="chip-row min-w-0 flex-1">
          <button type="button" className="chip" aria-pressed={none} onClick={() => onChange({ decadal: null, year: null, month: null })}>
            本命
          </button>
          <button type="button" className="chip" onClick={onToday}>
            今天
          </button>
          {limits.decadals.map((item, index) => (
            <button
              key={index}
              type="button"
              className="chip"
              aria-pressed={selection.decadal === index}
              onClick={() => onChange({ decadal: index, year: null, month: null })}
            >
              <span className="sr-only">{`大限 ${item.ageRange[0]} 到 ${item.ageRange[1]} 歲，${item.palaceName}`}</span>
              <span aria-hidden="true">
                {item.ageRange[0]}–{item.ageRange[1]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {limits.years.length > 0 && (
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-[2.5em] shrink-0 font-kai text-ink-muted">流年</span>
          <div className="chip-row min-w-0 flex-1">
            {limits.years.map((item) => (
              <button
                key={item.year}
                type="button"
                className="chip"
                aria-pressed={selection.year === item.year}
                onClick={() =>
                  onChange({ decadal: selection.decadal, year: selection.year === item.year ? null : item.year, month: null })
                }
              >
                <span className="sr-only">{`流年 ${item.year}，${item.stem}${item.branch}年，虛歲 ${item.age}`}</span>
                <span aria-hidden="true">
                  {item.year} {item.stem}
                  {item.branch}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {limits.months.length > 0 && (
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-[2.5em] shrink-0 font-kai text-ink-muted">流月</span>
          <div className="chip-row min-w-0 flex-1">
            {limits.months.map((item) => (
              <button
                key={item.index}
                type="button"
                className="chip"
                aria-pressed={selection.month === item.index}
                onClick={() => onChange({ ...selection, month: selection.month === item.index ? null : item.index })}
              >
                <span className="sr-only">流月 農曆</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
