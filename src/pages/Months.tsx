import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { computeChart, computeMonths } from '../features/chart/engine';
import { focusText, monthRows, monthsMessage, monthYears, serializeMonths, solarRangeShort } from '../features/chart/months';
import { getChart } from '../features/chart/store';
import { MAX_YEAR, type ChartData, type SavedChart } from '../features/chart/types';
import { todayString } from '../features/reading/request';
import { configuredProviders } from '../features/settings/ModelSection';
import type { PendingAsk } from './Chart';

type Loaded = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; saved: SavedChart; chart: ChartData };

const th = 'py-1 pr-3 font-normal text-ink-muted';
const cell = 'whitespace-nowrap py-1 pr-3 font-kai';

/** 流月財運一覽：某一年每個流月的命宮與四化落點，由程式計算；可請 AI 依傳統看法判讀。 */
export function Months() {
  const { chartId } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const saved = chartId ? await getChart(chartId).catch(() => undefined) : undefined;
      if (cancelled) return;
      if (!saved) return setLoaded({ status: 'missing' });
      try {
        setLoaded({ status: 'ready', saved, chart: computeChart(saved.input, saved.chartSettings) });
      } catch {
        setLoaded({ status: 'missing' });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [chartId]);

  const saved = loaded.status === 'ready' ? loaded.saved : null;
  const chart = loaded.status === 'ready' ? loaded.chart : null;
  const years = useMemo(() => (chart ? monthYears(chart, MAX_YEAR) : []), [chart]);
  const thisYear = Number(todayString().split('-')[0]);
  const year = picked ?? (years.includes(thisYear) ? thisYear : (years[0] ?? thisYear));

  const rows = useMemo(() => {
    if (!saved || !chart) return null;
    try {
      return monthRows(chart, computeMonths(saved.input, saved.chartSettings, year));
    } catch {
      return null;
    }
  }, [chart, saved, year]);

  if (loaded.status === 'loading') {
    return (
      <p role="status" className="text-ink-muted">
        讀取命盤中
      </p>
    );
  }
  if (!saved || !chart) {
    return (
      <section aria-labelledby="months-title">
        <h1 id="months-title" className="text-[1.75rem] md:text-[2.25rem]">
          找不到這張命盤
        </h1>
        <p className="mt-4 max-w-[34em]">這張命盤不在這台裝置上。請先排出命盤，再看流月。</p>
        <p className="mt-4">
          <Link to="/" className="text-accent underline underline-offset-4">
            回到排盤
          </Link>
        </p>
      </section>
    );
  }

  const name = saved.input.name;
  const hasKey = configuredProviders().length > 0;

  function askAI() {
    if (!saved || !rows) return;
    const ask: PendingAsk = { message: monthsMessage(year), extra: serializeMonths(year, rows) };
    void navigate(`/chart/${saved.id}`, { state: { ask } });
  }

  return (
    <div>
      <p className="text-sm">
        <Link to={`/chart/${saved.id}`} className="text-accent underline underline-offset-4">
          回到{name}的命盤
        </Link>
      </p>
      <h1 className="mt-2 text-[1.75rem] md:text-[2.25rem]">流月財運一覽</h1>
      {/* 寬螢幕：說明、年份與「請 AI 判讀」在左欄，表格在右欄；窄一點就照原本的順序上下排。 */}
      <div className="2xl:grid 2xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] 2xl:items-start 2xl:gap-x-12">
      <div className="2xl:col-start-1 2xl:row-start-1">
      <p className="mt-3 max-w-[34em]">
        選一年，列出每個流月的流月命宮與流月四化落在本命盤的哪一宮。傳統上看財運，會留意祿與忌有沒有落在命宮、財帛、福德、田宅。
      </p>
      <div className="mt-4 max-w-[34em] border-l-2 border-line pl-3">
        <p>
          這是紫微斗數的傳統看法，沒有統計驗證。流月描述的是你個人的狀態，股票或其他標的的價格不會跟著它走，請不要單獨用它決定買賣。
        </p>
        <p className="mt-2">
          比較穩妥的用法是當成過濾條件：你原本的分析已經出現加碼訊號，而且那個月傳統上偏順，才加碼；否則縮小或延後。減碼與停損只看你原本的分析，不受流月影響。
        </p>
      </div>

      <div className="mt-6 max-w-[16rem]">
        <label htmlFor="months-year" className="font-kai text-[1.0625rem] font-bold">
          要看的年份
        </label>
        <select
          id="months-year"
          className="mt-1 w-full rounded-control border border-line bg-bg px-3 py-2 text-base text-ink"
          value={year}
          onChange={(event) => setPicked(Number(event.target.value))}
        >
          {years.map((item) => (
            <option key={item} value={item}>
              {item} 年
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-ink-muted">年份指農曆年；臘月會落在隔年的國曆一、二月。</p>
      </div>
      <p className="mt-2 max-w-[34em] text-sm text-ink-muted">
        國曆期間是每個農曆月的初一到月底。流月的干支與四化取初一那一天的月干，而月干依節氣換月，和農曆月初通常差幾天到兩週；交界前後的日子請保守看待。
      </p>
      </div>

      {rows ? (
        <div className="relative mt-5 max-w-full overflow-x-auto 2xl:col-start-2 2xl:row-span-2 2xl:row-start-1" role="region" aria-label={`${year} 年的流月（可橫向捲動）`} tabIndex={0}>
          <table className="w-full min-w-[52rem] max-w-[72rem] border-collapse text-[0.9375rem]">
            <caption className="pb-2 text-left font-kai text-[1.125rem] font-bold">{year} 年的流月</caption>
            <thead>
              <tr className="border-b border-line text-left font-kai">
                {['流月（農曆）', '國曆期間', '落在命財福田', '干支', '流月命宮落在', '化祿', '化權', '化科', '化忌'].map((heading) => (
                  <th key={heading} scope="col" className={`whitespace-nowrap ${th}`}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-line-soft">
                  <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-kai font-bold">
                    {row.label}
                  </th>
                  <td className={cell}>{solarRangeShort(row)}</td>
                  {/* 最常看的一欄放前面：手機上不用橫向捲動就看得到。 */}
                  <td className={`${cell} font-bold`}>{focusText(row) || <span className="font-normal text-ink-muted">沒有</span>}</td>
                  <td className={cell}>{row.stemBranch}</td>
                  <td className={cell}>{row.palaceName}</td>
                  {row.hits.map((hit) => (
                    <td key={hit.mutagen} className={cell}>
                      {hit.star} → {hit.palaceName || '無'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p role="alert" className="mt-4 border-l-2 border-danger pl-3 text-danger 2xl:col-start-2 2xl:row-span-2 2xl:row-start-1">
          這一年的流月算不出來，請改選其他年份。
        </p>
      )}

      <section aria-labelledby="months-ask" className="mt-8 2xl:col-start-1 2xl:row-start-2">
        <h2 id="months-ask" className="text-[1.375rem]">
          請 AI 判讀
        </h2>
        <p className="mt-2 max-w-[34em]">
          AI 會依傳統看法，把每個流月標成「傳統上偏順」「傳統上偏保守」或「沒有明顯訊號」並寫出依據。上面這張表會一併送出；AI 不會提任何標的或價位。回覆最後會附一段「可貼上的流月過濾」，月份同時寫農曆月名與國曆期間，可以整段複製到投資工具的偏好欄位。
        </p>
        {hasKey ? (
          <button type="button" className="mt-3 rounded-control bg-accent px-4 py-2 font-kai font-bold text-accent-ink disabled:opacity-60" disabled={!rows} onClick={askAI}>
            請 AI 判讀 {year} 年的流月財運
          </button>
        ) : (
          <p className="mt-3 max-w-[34em] text-ink-muted">
            請 AI 判讀需要 API 金鑰。
            <Link to="/settings" className="text-accent underline underline-offset-4">
              前往設定
            </Link>
          </p>
        )}
      </section>
      </div>
    </div>
  );
}
