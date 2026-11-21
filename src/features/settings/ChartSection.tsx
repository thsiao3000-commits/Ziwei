import { useId } from 'react';
import type { ChartSettings } from '../chart/types';
import { Choice } from './Choice';
import { usePreferences, type Density } from './preferences';
import { useSettings } from './store';
import { fieldClass, legendClass } from './ui';

const DIVIDE = [
  { value: 'normal', label: '正月初一' },
  { value: 'exact', label: '立春' },
] as const;

type DensityChoice = Density | 'auto';

const DENSITY_OPTIONS: readonly { value: DensityChoice; label: string }[] = [
  { value: 'auto', label: '自動' },
  { value: 'compact', label: '精簡' },
  { value: 'standard', label: '標準' },
  { value: 'full', label: '完整' },
];

/** 排盤設定（HANDOFF 第 4.3 節）。每個選項都用一句白話說明它會改變什麼。 */
export function ChartSection() {
  const id = useId();
  const defaults = useSettings((state) => state.chartDefaults);
  const school = useSettings((state) => state.school);
  const customPerspective = useSettings((state) => state.customPerspective);
  const update = useSettings((state) => state.update);
  const density = usePreferences((state) => state.density);
  const setDensity = usePreferences((state) => state.setDensity);
  const resetDensity = usePreferences((state) => state.resetDensity);

  function set<K extends keyof ChartSettings>(key: K, value: ChartSettings[K]) {
    update({ chartDefaults: { ...defaults, [key]: value } });
  }

  return (
    <div className="mt-3 grid gap-6">
      <p className="max-w-[34em] text-sm text-ink-muted">
        排盤選項用在之後新排的命盤。已經排好的命盤保留當時的設定，可以在命盤頁改用目前的設定重排。
      </p>

      <Choice
        name={`${id}-school`}
        legend="解讀取向"
        hint="AI 解讀時預設採用的看法。提問時可以在解讀面板另選視角。"
        value={school}
        options={[
          { value: 'sanhe', label: '三合為主' },
          { value: 'feixing', label: '飛星四化為主' },
        ]}
        onChange={(value) => update({ school: value })}
      />

      <div>
        <label htmlFor={`${id}-custom`} className={legendClass}>
          自訂視角 <span className="font-serif text-sm font-normal text-ink-muted">選填</span>
        </label>
        <p className="max-w-[34em] text-sm text-ink-muted">
          寫下你希望 AI 採用的解讀方式，例如「用白話、少術語」。在解讀面板選「自訂視角」時才會用到。只存在這台裝置。
        </p>
        <textarea
          id={`${id}-custom`}
          className={`${fieldClass} mt-2 max-w-[32rem]`}
          rows={3}
          maxLength={600}
          value={customPerspective}
          onChange={(event) => update({ customPerspective: event.target.value })}
        />
      </div>

      <Choice
        name={`${id}-year`}
        legend="年分界"
        hint="出生年的干支與生年四化從哪一天換年。只有在春節與立春之間出生的人，兩種設定排出的盤才會不同。"
        value={defaults.yearDivide}
        options={DIVIDE}
        onChange={(value) => set('yearDivide', value)}
      />

      <Choice
        name={`${id}-horoscope`}
        legend="運限分界"
        hint="流年從哪一天換年；也決定四柱的月柱，以及歲前、將前十二神與依年支安的雜曜。預設「立春」，與 iztro 官方線上排盤相同。"
        value={defaults.horoscopeDivide}
        options={DIVIDE}
        onChange={(value) => set('horoscopeDivide', value)}
      />

      <Choice
        name={`${id}-age`}
        legend="小限分界"
        hint="小限的虛歲從哪一天加一歲。"
        value={defaults.ageDivide}
        options={[
          { value: 'normal', label: '過年' },
          { value: 'birthday', label: '生日' },
        ]}
        onChange={(value) => set('ageDivide', value)}
      />

      <Choice
        name={`${id}-day`}
        legend="晚子時"
        hint="23:00–24:00 出生的人，日柱與星曜要依隔天還是當天計算。兩種排出的盤不同。"
        value={defaults.dayDivide}
        options={[
          { value: 'forward', label: '算來日' },
          { value: 'current', label: '算當日' },
        ]}
        onChange={(value) => set('dayDivide', value)}
      />

      <Choice
        name={`${id}-algorithm`}
        legend="安星法"
        hint="星曜怎麼排進十二宮。中州派在部分輔星、雜曜與亮度上和通行版本不同。"
        value={defaults.algorithm}
        options={[
          { value: 'default', label: '通行版本' },
          { value: 'zhongzhou', label: '中州派' },
        ]}
        onChange={(value) => set('algorithm', value)}
      />

      <Choice<DensityChoice>
        name={`${id}-density`}
        legend="預設顯示密度"
        hint="命盤每一宮顯示多少內容。「自動」在手機用精簡，在電腦用標準。"
        value={density ?? 'auto'}
        options={DENSITY_OPTIONS}
        onChange={(value) => {
          if (value === 'auto') resetDensity();
          else setDensity(value);
          // 密度存在另一個地方，這裡補上「已儲存」的回饋。
          update({});
        }}
      />
    </div>
  );
}
