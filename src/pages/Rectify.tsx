import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CentreInfo } from '../features/chart/CentreInfo';
import { ChartBoard } from '../features/chart/ChartBoard';
import { computeTimeCandidates } from '../features/chart/engine';
import { majorStarRows, neighbours, RECTIFY_MESSAGE, serializeCandidates, summarise } from '../features/chart/rectify';
import { getChart, saveChart, updateChart } from '../features/chart/store';
import type { SavedChart, TimeCandidate } from '../features/chart/types';
import { configuredProviders } from '../features/settings/ModelSection';
import type { PendingAsk } from './Chart';

const button = 'rounded-control border border-line px-3 py-1 font-kai disabled:border-line-soft disabled:text-ink-muted';

type Loaded = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; saved: SavedChart; candidates: TimeCandidate[] };

function CandidateBoard({ candidate, name, isCurrent }: { candidate: TimeCandidate; name: string; isCurrent: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const summary = summarise(candidate);
  return (
    <ChartBoard
      chart={candidate.chart}
      density="compact"
      selected={selected}
      onSelect={setSelected}
      label={`${summary.name}的命盤${isCurrent ? '（目前）' : ''}`}
      centre={<CentreInfo chart={candidate.chart} name={name} />}
    />
  );
}

/** 定盤輔助：不確定出生時辰時，比較相鄰時辰排出的命盤。 */
export function Rectify() {
  const { chartId } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [centre, setCentre] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const saved = chartId ? await getChart(chartId).catch(() => undefined) : undefined;
      if (cancelled) return;
      if (!saved) return setLoaded({ status: 'missing' });
      setLoaded({ status: 'ready', saved, candidates: computeTimeCandidates(saved.input, saved.chartSettings) });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [chartId]);

  const saved = loaded.status === 'ready' ? loaded.saved : null;
  const candidates = loaded.status === 'ready' ? loaded.candidates : null;
  const current = saved?.input.timeIndex ?? 0;
  const focus = centre ?? current;
  const shown = useMemo(() => (candidates ? neighbours(candidates, focus) : []), [candidates, focus]);
  const rows = useMemo(() => majorStarRows(shown), [shown]);

  if (loaded.status === 'loading') {
    return (
      <p role="status" className="text-ink-muted">
        讀取命盤中
      </p>
    );
  }
  if (!saved || !candidates) {
    return (
      <section aria-labelledby="rectify-title">
        <h1 id="rectify-title" className="text-[1.75rem] md:text-[2.25rem]">
          找不到這張命盤
        </h1>
        <p className="mt-4 max-w-[34em]">這張命盤不在這台裝置上。請先排出命盤，再比較相鄰的時辰。</p>
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

  async function adopt(timeIndex: number) {
    if (!saved) return;
    try {
      await updateChart(saved.id, { timeIndex });
      await navigate(`/chart/${saved.id}`);
    } catch {
      setError('時辰沒有改成功：命盤無法寫回這台裝置。請重新整理後再試。');
    }
  }

  async function saveAsNew(candidate: TimeCandidate) {
    if (!saved) return;
    try {
      const { clockTime: _clockTime, ...rest } = saved.input;
      void _clockTime;
      const summary = summarise(candidate);
      const copy = await saveChart({ ...rest, name: `${name}（${summary.name}）`.slice(0, 20), timeIndex: candidate.timeIndex }, saved.chartSettings);
      await navigate(`/chart/${copy.id}`);
    } catch {
      setError('另存失敗：命盤無法存到這台裝置。請重新整理後再試。');
    }
  }

  function askAI() {
    if (!saved) return;
    const ask: PendingAsk = { message: RECTIFY_MESSAGE, extra: serializeCandidates(shown, current) };
    void navigate(`/chart/${saved.id}`, { state: { ask } });
  }

  return (
    <div>
      <p className="text-sm">
        <Link to={`/chart/${saved.id}`} className="text-accent underline underline-offset-4">
          回到{name}的命盤
        </Link>
      </p>
      <h1 className="mt-2 text-[1.75rem] md:text-[2.25rem]">時辰對照</h1>
      <p className="mt-3 max-w-[34em]">
        出生時辰每差一個，命宮就移動一宮，整張盤都不一樣。下面列出同一個生日在十三個時辰排出的重點；選一個時辰，可以把它和前後兩個時辰的命盤並排比較。
      </p>

      {error && (
        <p role="alert" className="mt-4 border-l-2 border-danger pl-3 text-danger">
          {error}
        </p>
      )}

      {/* 窄螢幕上表格可橫向捲動：要能用鍵盤聚焦後捲動。 */}
      <div className="mt-6 relative max-w-full overflow-x-auto" role="region" aria-label="十三個時辰的命盤重點（可橫向捲動）" tabIndex={0}>
        <table className="w-full min-w-[40rem] max-w-[52rem] border-collapse text-[0.9375rem]">
          <caption className="pb-2 text-left font-kai text-[1.125rem] font-bold">十三個時辰的命盤重點</caption>
          <thead>
            <tr className="border-b border-line text-left font-kai">
              {['時辰', '命宮', '命宮主星', '身宮', '五行局', '起運', ''].map((heading, index) => (
                <th key={index} scope="col" className="whitespace-nowrap py-1 pr-3 font-normal text-ink-muted">
                  {heading || <span className="sr-only">並排比較</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => {
              const summary = summarise(candidate);
              const isCurrent = candidate.timeIndex === current;
              const isShown = Math.abs(candidate.timeIndex - focus) <= 1;
              return (
                <tr key={candidate.timeIndex} className={`border-b border-line-soft ${isShown ? 'bg-surface' : ''}`}>
                  <th scope="row" className="py-1.5 pl-2 pr-3 text-left font-kai font-bold">
                    {summary.name}
                    <span className="ml-2 font-serif text-sm font-normal text-ink-muted">{summary.range}</span>
                    {isCurrent && <span className="ml-2 border border-line px-1 text-sm font-normal">目前</span>}
                  </th>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-kai">{summary.soulBranch}</td>
                  <td className="py-1.5 pr-3 font-kai">{summary.soulStars}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-kai">{summary.bodyPalace}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-kai">{summary.fiveElementsClass}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{summary.startAge} 歲</td>
                  <td className="py-1.5 pr-2 text-right">
                    <button
                      type="button"
                      className={button}
                      aria-pressed={candidate.timeIndex === focus}
                      onClick={() => setCentre(candidate.timeIndex)}
                    >
                      <span className="sr-only">{summary.name}：</span>並排比較
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="rectify-side" className="mt-10">
        <h2 id="rectify-side" className="text-[1.5rem]">
          {shown.map((candidate) => summarise(candidate).name).join('、')}並排
        </h2>

        <div className="mt-4 grid gap-8 lg:grid-cols-3 lg:gap-6">
          {shown.map((candidate) => {
            const summary = summarise(candidate);
            const isCurrent = candidate.timeIndex === current;
            return (
              <div key={candidate.timeIndex} className="min-w-0">
                <h3 className="text-[1.25rem]">
                  {summary.name}
                  <span className="ml-2 font-serif text-sm font-normal text-ink-muted">{summary.range}</span>
                  {isCurrent && <span className="ml-2 border border-line px-1 font-kai text-sm font-normal">目前</span>}
                </h3>
                <div className="mx-auto mt-2 w-full max-w-[420px] lg:max-w-none">
                  <CandidateBoard candidate={candidate} name={name} isCurrent={isCurrent} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!isCurrent && (
                    <button type="button" className={button} onClick={() => void adopt(candidate.timeIndex)}>
                      把這張命盤改成{summary.name}
                    </button>
                  )}
                  <button type="button" className={button} onClick={() => void saveAsNew(candidate)}>
                    把{summary.name}另存成新命盤
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="xl:grid xl:grid-cols-[minmax(0,40rem)_minmax(0,34rem)] xl:items-start xl:gap-x-16">
        <div className="mt-8 relative max-w-full overflow-x-auto" role="region" aria-label="逐宮主星對照（可橫向捲動）" tabIndex={0}>
          <table className="w-full min-w-[22rem] max-w-[40rem] border-collapse text-[0.9375rem]">
            <caption className="pb-2 text-left font-kai text-[1.125rem] font-bold">逐宮主星對照</caption>
            <thead>
              <tr className="border-b border-line text-left font-kai">
                <th scope="col" className="whitespace-nowrap py-1 pr-3 font-normal text-ink-muted">
                  宮位
                </th>
                {shown.map((candidate) => (
                  <th key={candidate.timeIndex} scope="col" className="py-1 pr-3 font-normal text-ink-muted">
                    {summarise(candidate).name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.palace} className="border-b border-line-soft">
                  <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-kai font-bold">
                    {row.palace}
                  </th>
                  {row.stars.map((stars, index) => (
                    <td key={index} className="py-1 pr-3 font-kai">
                      {stars}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 max-w-[34em]">
          <h3 className="text-[1.25rem]">請 AI 協助分辨</h3>
          <p className="mt-2">
            把上面這{shown.length}個時辰的命盤重點交給 AI，請它列出可以用過去的經歷與個性來分辨的問題。AI 不會替你決定時辰。
          </p>
          {hasKey ? (
            <p className="mt-3">
              <button type="button" onClick={askAI} className="rounded-control bg-accent px-4 py-2 font-kai font-bold text-accent-ink">
                請 AI 列出分辨這{shown.length}個時辰的問題
              </button>
            </p>
          ) : (
            <p className="mt-3 text-ink-muted">
              需要先設定 API 金鑰。
              <Link to="/settings" className="ml-1 text-accent underline underline-offset-4">
                前往設定
              </Link>
            </p>
          )}
        </div>
        </div>
      </section>
    </div>
  );
}
