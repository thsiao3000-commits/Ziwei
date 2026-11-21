import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BirthForm } from '../features/chart/BirthForm';
import { CentreInfo } from '../features/chart/CentreInfo';
import { ChartBoard } from '../features/chart/ChartBoard';
import { useEngine } from '../features/chart/engineLoader';
import { saveChart } from '../features/chart/store';
import { DEFAULT_CHART_SETTINGS, type BirthInput } from '../features/chart/types';
import { defaultDensity } from '../features/settings/preferences';
import { useSettings } from '../features/settings/store';

/** 示範命盤用的是 iztro 文件裡的範例生日，不是任何人的真實資料。 */
const DEMO_INPUT: BirthInput = {
  name: '示範',
  gender: 'female',
  calendar: 'solar',
  date: '2000-8-16',
  timeIndex: 2,
};

export function Home() {
  const navigate = useNavigate();
  // 排盤模組在背景載入；載入前先保留示範命盤的位置，版面不會跳動。
  const engine = useEngine();
  const demo = useMemo(() => (engine ? engine.computeChart(DEMO_INPUT, DEFAULT_CHART_SETTINGS) : null), [engine]);
  const [selected, setSelected] = useState<number | null>(null);
  const [density] = useState(defaultDensity);

  async function handleSubmit(input: BirthInput) {
    const saved = await saveChart(input, useSettings.getState().chartDefaults);
    // 出生資料不進網址：只帶本機隨機 id。
    await navigate(`/chart/${saved.id}`, { state: { fresh: true } });
  }

  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-12 xl:grid-cols-[minmax(0,30rem)_minmax(0,720px)]">
      <section aria-labelledby="home-title">
        <h1 id="home-title" className="text-[1.75rem] md:text-[2.25rem]">
          排出命盤
        </h1>
        <p className="mt-3 max-w-[34em]">
          輸入出生的年月日與時辰。星曜位置、四化與大限都由排盤程式計算。
        </p>
        <div className="mt-6">
          <BirthForm onSubmit={handleSubmit} />
        </div>
        <p className="mt-6 max-w-[34em] text-sm">
          <Link to="/import" className="text-accent underline underline-offset-4">
            已經有命盤截圖？請 AI 讀出出生資料帶入表單
          </Link>
        </p>
        <p className="mt-2 max-w-[34em] text-sm text-ink-muted">
          不確定出生時辰也可以先選最可能的一個：排盤後，命盤頁有「比較相鄰時辰的命盤」可以對照。
        </p>
        <p className="mt-2 max-w-[34em] text-sm text-ink-muted">
          出生資料只存在這台裝置的瀏覽器，本站沒有伺服器會收到它。
        </p>
      </section>

      <section aria-labelledby="demo-title" className="w-full max-w-[720px]">
        <h2 id="demo-title" className="text-[1.125rem]">
          示範命盤
        </h2>
        <p className="mb-3 text-sm text-ink-muted">
          國曆 2000 年 8 月 16 日寅時出生的女性。點任一宮位，會標出它的三方四正。
        </p>
        {demo ? (
          <ChartBoard
            chart={demo}
            density={density}
            selected={selected}
            onSelect={setSelected}
            label="示範命盤"
            centre={<CentreInfo chart={demo} name={DEMO_INPUT.name} />}
          />
        ) : (
          <div role="status" className="flex aspect-square w-full items-center justify-center border border-line font-kai text-ink-muted">
            示範命盤載入中
          </div>
        )}
      </section>
    </div>
  );
}
