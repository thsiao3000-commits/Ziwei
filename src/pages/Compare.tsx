import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CentreInfo } from '../features/chart/CentreInfo';
import { ChartBoard } from '../features/chart/ChartBoard';
import { computeChart } from '../features/chart/engine';
import { formatSolarDate } from '../features/chart/layout';
import { listCharts } from '../features/chart/store';
import type { ChartData, SavedChart } from '../features/chart/types';
import {
  COMPARE_PROMPTS,
  COMPARE_RULES,
  compareKey,
  crossMutagens,
  palaceRows,
  serializeCompare,
  soulPlacement,
  type Party,
} from '../features/compare/compare';
import { conversationToMarkdown } from '../features/reading/exportMarkdown';
import { ReadingPanel } from '../features/reading/ReadingPanel';
import { todayString } from '../features/reading/request';
import type { School } from '../features/reading/serialize';
import { useReading } from '../features/reading/useReading';
import { configuredProviders } from '../features/settings/ModelSection';
import { defaultDensity, usePreferences } from '../features/settings/preferences';
import { useSettings } from '../features/settings/store';
import { downloadBlob, safeFilename } from '../lib/download';

type Side = { saved: SavedChart; chart: ChartData };

/** 宮名補上「宮」字；「命宮」本身已經有了，不重複。 */
function withPalace(name: string): string {
  return name.endsWith('宮') ? name : `${name}宮`;
}

const selectClass = 'w-full rounded-control border border-line bg-bg px-3 py-2 text-base text-ink';
const button = 'rounded-control border border-line px-3 py-1 font-kai disabled:border-line-soft disabled:text-ink-muted';

function Board({ side, label }: { side: Side; label: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const stored = usePreferences((state) => state.density);
  const [fallback] = useState(defaultDensity);
  return (
    <ChartBoard
      chart={side.chart}
      density={stored ?? fallback}
      selected={selected}
      onSelect={setSelected}
      label={label}
      centre={<CentreInfo chart={side.chart} name={side.saved.input.name} />}
    />
  );
}

function CompareView({ a, b }: { a: Side; b: Side }) {
  const nameA = a.saved.input.name;
  const nameB = b.saved.input.name;

  useSettings((state) => state.keyStatus);
  useSettings((state) => state.keyStorage);
  const defaultProvider = useSettings((state) => state.defaultProvider);
  const includeBirthDate = useSettings((state) => state.includeBirthDate);
  const defaultSchool = useSettings((state) => state.school);
  const configured = configuredProviders();
  const provider = defaultProvider && configured.includes(defaultProvider) ? defaultProvider : (configured[0] ?? null);
  const [perspective, setPerspective] = useState<School>(defaultSchool);

  // 給模型的兩張盤與交互關係。預設用「甲」「乙」稱呼，不送稱呼與出生年月日。
  const compare = useMemo(() => {
    const partyA: Party = { label: '甲', chart: a.chart, ...(includeBirthDate ? { birth: a.saved.input } : {}) };
    const partyB: Party = { label: '乙', chart: b.chart, ...(includeBirthDate ? { birth: b.saved.input } : {}) };
    return { key: compareKey(a.saved.id, b.saved.id), context: serializeCompare(partyA, partyB, perspective), rules: COMPARE_RULES };
  }, [a, b, includeBirthDate, perspective]);

  const reading = useReading({ saved: a.saved, chart: a.chart, selectedPalace: null, provider, perspective, compare });

  const rows = useMemo(() => palaceRows(a.chart, b.chart), [a.chart, b.chart]);
  const soulAB = soulPlacement(a.chart, b.chart);
  const soulBA = soulPlacement(b.chart, a.chart);
  const crossAB = crossMutagens(a.chart, b.chart);
  const crossBA = crossMutagens(b.chart, a.chart);

  function exportConversation() {
    const conversation = reading.current;
    if (!conversation) return;
    const fact = (side: Side, label: string) =>
      `${label}：${side.saved.input.name}（${side.chart.gender === 'male' ? '男' : '女'}）國曆 ${formatSolarDate(side.chart.solarDate)} ${side.chart.time}`;
    const markdown = conversationToMarkdown({
      conversation,
      chart: a.chart,
      name: nameA,
      anonymous: false,
      exportedOn: todayString(),
      facts: [fact(a, '甲'), fact(b, '乙')],
    });
    downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `紫微合盤-${safeFilename(`${nameA}與${nameB}`, '合盤')}.md`);
  }

  return (
    <div className="mt-6 grid gap-10 2xl:grid-cols-[minmax(0,1120px)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-6">
          {(
            [
              ['甲', a],
              ['乙', b],
            ] as const
          ).map(([label, side]) => (
            <section key={label} aria-labelledby={`compare-${label}`} className="min-w-0">
              <h2 id={`compare-${label}`} className="text-[1.25rem]">
                {label}：{side.saved.input.name}
                <Link to={`/chart/${side.saved.id}`} className="ml-3 font-serif text-sm font-normal text-accent underline underline-offset-4">
                  開啟這張命盤
                </Link>
              </h2>
              <div className="mx-auto mt-2 w-full max-w-[560px] lg:max-w-none">
                <Board side={side} label={`${label}：${side.saved.input.name}的命盤`} />
              </div>
            </section>
          ))}
        </div>

        <section aria-labelledby="compare-cross" className="mt-10">
          <h2 id="compare-cross" className="text-[1.5rem]">
            兩張盤的交互關係
          </h2>
          <p className="mt-2 max-w-[34em] text-sm text-ink-muted">
            以下由排盤程式算出，不是 AI 推算的。合盤常看對方的命宮與生年四化落在自己盤上的哪一宮。
          </p>
          <ul className="mt-3 grid max-w-[60rem] gap-2">
            <li>
              <span className="font-kai font-bold">{nameA}</span>的命宮（{soulAB.branch}）落在<span className="font-kai font-bold">{nameB}</span>的
              <span className="font-kai">{withPalace(soulAB.palaceName)}</span>。
            </li>
            <li>
              <span className="font-kai font-bold">{nameB}</span>的命宮（{soulBA.branch}）落在<span className="font-kai font-bold">{nameA}</span>的
              <span className="font-kai">{withPalace(soulBA.palaceName)}</span>。
            </li>
          </ul>

          <div className="relative mt-5 max-w-full overflow-x-auto" role="region" aria-label="生年四化互入（可橫向捲動）" tabIndex={0}>
            <table className="w-full min-w-[26rem] max-w-[44rem] border-collapse text-[0.9375rem]">
              <caption className="pb-2 text-left font-kai text-[1.125rem] font-bold">生年四化互入</caption>
              <thead>
                <tr className="border-b border-line text-left font-kai">
                  <th scope="col" className="whitespace-nowrap py-1 pr-3 font-normal text-ink-muted">
                    四化
                  </th>
                  <th scope="col" className="py-1 pr-3 font-normal text-ink-muted">
                    {nameA}的四化落在{nameB}的
                  </th>
                  <th scope="col" className="py-1 pr-3 font-normal text-ink-muted">
                    {nameB}的四化落在{nameA}的
                  </th>
                </tr>
              </thead>
              <tbody>
                {crossAB.map((item, index) => {
                  const other = crossBA[index];
                  return (
                    <tr key={item.mutagen} className="border-b border-line-soft">
                      <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-kai font-bold">
                        化{item.mutagen}
                      </th>
                      <td className="py-1 pr-3 font-kai">
                        {item.star} → {item.palaceName ? withPalace(item.palaceName) : '盤上沒有這顆星'}
                      </td>
                      <td className="py-1 pr-3 font-kai">
                        {other ? `${other.star} → ${other.palaceName ? withPalace(other.palaceName) : '盤上沒有這顆星'}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="relative mt-8 max-w-full overflow-x-auto" role="region" aria-label="逐宮主星對照（可橫向捲動）" tabIndex={0}>
            <table className="w-full min-w-[22rem] max-w-[44rem] border-collapse text-[0.9375rem]">
              <caption className="pb-2 text-left font-kai text-[1.125rem] font-bold">逐宮主星對照</caption>
              <thead>
                <tr className="border-b border-line text-left font-kai">
                  <th scope="col" className="whitespace-nowrap py-1 pr-3 font-normal text-ink-muted">
                    宮位
                  </th>
                  <th scope="col" className="py-1 pr-3 font-normal text-ink-muted">
                    {nameA}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-normal text-ink-muted">
                    {nameB}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.palace} className="border-b border-line-soft">
                    <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-kai font-bold">
                      {row.palace}
                    </th>
                    <td className="py-1 pr-3 font-kai">{row.a}</td>
                    <td className="py-1 pr-3 font-kai">{row.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section id="reading-section" aria-labelledby="compare-reading" className="min-w-0 2xl:border-l 2xl:border-line 2xl:pl-10">
        <p className="mb-3 max-w-[34em] text-sm text-ink-muted">
          AI 的回覆會用「甲」「乙」稱呼這兩張盤：甲是{nameA}，乙是{nameB}。
          {includeBirthDate ? '你已開啟「提問時附上出生年月日」，稱呼與生日也會送出。' : '稱呼與出生年月日不會送出。'}
        </p>
        <ReadingPanel
          reading={reading}
          configured={configured}
          provider={provider}
          selectedPalaceName={null}
          headingId="compare-reading"
          onExport={exportConversation}
          perspective={perspective}
          onPerspectiveChange={setPerspective}
          attachedLimits={null}
          quickPrompts={COMPARE_PROMPTS}
          title="合盤解讀"
          subject="兩張命盤的內容"
        />
      </section>
    </div>
  );
}

/** 合盤（CR-13）：兩張命盤並排，看交互關係，並請 AI 比較。 */
export function Compare() {
  const { a, b } = useParams();
  const navigate = useNavigate();
  const [charts, setCharts] = useState<SavedChart[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listCharts()
      .then((list) => {
        if (!cancelled) setCharts(list);
      })
      .catch(() => {
        if (!cancelled) setError('讀不到這台裝置上的命盤資料。請確認瀏覽器沒有停用網站儲存空間，再重新整理。');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sides = useMemo(() => {
    const build = (id: string | undefined): Side | null => {
      const saved = charts?.find((item) => item.id === id);
      if (!saved) return null;
      try {
        return { saved, chart: computeChart(saved.input, saved.chartSettings) };
      } catch {
        return null;
      }
    };
    return { a: build(a), b: build(b) };
  }, [a, b, charts]);

  function go(nextA: string, nextB: string) {
    void navigate(nextB ? `/compare/${nextA}/${nextB}` : `/compare/${nextA}`);
  }

  if (error) {
    return (
      <p role="alert" className="border-l-2 border-danger pl-3 text-danger">
        {error}
      </p>
    );
  }
  if (charts === null) {
    return (
      <p role="status" className="text-ink-muted">
        讀取命盤中
      </p>
    );
  }

  const label = (saved: SavedChart) => {
    const { input } = saved;
    const date = input.date.split('-');
    return `${input.name}（${input.gender === 'male' ? '男' : '女'}，${input.calendar === 'solar' ? '國曆' : '農曆'} ${date[0]} 年 ${date[1]} 月 ${date[2]} 日）`;
  };

  return (
    <div>
      <h1 className="text-[1.75rem] md:text-[2.25rem]">合盤</h1>
      <p className="mt-3 max-w-[34em]">
        選兩張命盤並排比較，看彼此的命宮與生年四化落在對方盤上的位置，再請 AI 說明兩人的互動模式。合盤顯示的是相處的傾向，不是「合不合」的結論。
      </p>

      {charts.length < 2 ? (
        <div className="mt-6 max-w-[34em] border-l-2 border-line pl-3">
          <p>合盤需要兩張命盤，目前這台裝置上只有 {charts.length} 張。請先排出另一個人的命盤。</p>
          <p className="mt-3">
            <Link to="/" className="text-accent underline underline-offset-4">
              前往排盤
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-6 grid max-w-[60rem] items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div>
            <label htmlFor="compare-pick-a" className="font-kai text-[1.0625rem] font-bold">
              甲
            </label>
            <select id="compare-pick-a" className={`${selectClass} mt-1`} value={sides.a?.saved.id ?? ''} onChange={(event) => go(event.target.value, b === event.target.value ? '' : (b ?? ''))}>
              <option value="">選擇命盤</option>
              {charts.map((item) => (
                <option key={item.id} value={item.id}>
                  {label(item)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className={button} disabled={!sides.a || !sides.b} onClick={() => sides.a && sides.b && go(sides.b.saved.id, sides.a.saved.id)}>
            甲乙對調
          </button>
          <div>
            <label htmlFor="compare-pick-b" className="font-kai text-[1.0625rem] font-bold">
              乙
            </label>
            <select
              id="compare-pick-b"
              className={`${selectClass} mt-1`}
              value={sides.b?.saved.id ?? ''}
              disabled={!sides.a}
              onChange={(event) => sides.a && go(sides.a.saved.id, event.target.value)}
            >
              <option value="">選擇命盤</option>
              {charts
                .filter((item) => item.id !== sides.a?.saved.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {label(item)}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {charts.length >= 2 && (!sides.a || !sides.b) && (
        <p className="mt-4 text-ink-muted" role="status">
          {sides.a ? '請選擇要比較的另一張命盤（乙）。' : '請先選擇第一張命盤（甲）。'}
        </p>
      )}

      {sides.a && sides.b && <CompareView key={`${sides.a.saved.id}-${sides.b.saved.id}`} a={sides.a} b={sides.b} />}
    </div>
  );
}
