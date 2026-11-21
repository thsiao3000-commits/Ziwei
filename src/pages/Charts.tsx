import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { computeChart } from '../features/chart/engine';
import { formatSolarDate, soulSummary } from '../features/chart/layout';
import { deleteChart, listCharts, updateChart } from '../features/chart/store';
import { timeSlotLabel } from '../features/chart/time';
import type { SavedChart } from '../features/chart/types';

type Row = { saved: SavedChart; birthday: string; soul: string };

const button = 'rounded-control border border-line px-3 py-1 font-kai';

function toRow(saved: SavedChart): Row {
  const { input } = saved;
  try {
    const chart = computeChart(input, saved.chartSettings);
    const birthday =
      input.calendar === 'solar' ? `國曆 ${formatSolarDate(chart.solarDate)}` : `農曆 ${chart.lunarDate}`;
    return { saved, birthday: `${birthday}　${timeSlotLabel(input.timeIndex)}`, soul: soulSummary(chart) };
  } catch {
    return { saved, birthday: '這筆資料無法排盤', soul: '' };
  }
}

/** 「2026-11-21T13:05:00.000Z」→ 當地時間的「2026/11/21 21:05」 */
function formatTime(iso: string | undefined): string {
  if (!iso) return '還沒開啟過';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function Charts() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  async function load() {
    setRows((await listCharts()).map(toRow));
  }

  useEffect(() => {
    let cancelled = false;
    listCharts()
      .then((charts) => {
        if (!cancelled) setRows(charts.map(toRow));
      })
      .catch(() => {
        if (!cancelled) setError('讀不到這台裝置上的命盤資料。請確認瀏覽器沒有停用網站儲存空間，再重新整理。');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(id: string, patch: Parameters<typeof updateChart>[1]) {
    try {
      await updateChart(id, patch);
      await load();
    } catch {
      setError('變更沒有存成功，請重新整理後再試一次。');
    }
  }

  async function remove(id: string) {
    try {
      await deleteChart(id);
      setRows((current) => current?.filter((row) => row.saved.id !== id) ?? null);
    } catch {
      setError('刪除失敗，請重新整理後再試一次。');
    } finally {
      setConfirming(null);
    }
  }

  return (
    <section aria-labelledby="charts-title">
      <h1 id="charts-title" className="text-[1.75rem] md:text-[2.25rem]">
        我的命盤
      </h1>

      {error && (
        <p role="alert" className="mt-4 border-l-2 border-danger pl-3 text-danger">
          {error}
        </p>
      )}

      {rows === null && !error && (
        <p role="status" className="mt-4 text-ink-muted">
          讀取中
        </p>
      )}

      {rows !== null && rows.length === 0 && (
        <>
          <p className="mt-4 max-w-[34em]">還沒有命盤。輸入出生資料，排出第一張。</p>
          <p className="mt-4">
            <Link to="/" className="text-accent underline underline-offset-4">
              前往排盤
            </Link>
          </p>
        </>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="mt-6 max-w-[46rem] border-t border-line-soft">
          {rows.map(({ saved, birthday, soul }) => (
            <li key={saved.id} className="grid gap-3 border-b border-line-soft py-4">
              <div className="min-w-0">
                {renaming?.id === saved.id ? (
                  <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = renaming.name;
                      setRenaming(null);
                      void change(saved.id, { name });
                    }}
                  >
                    <label htmlFor={`name-${saved.id}`} className="sr-only">
                      稱呼
                    </label>
                    <input
                      id={`name-${saved.id}`}
                      className="min-w-0 flex-1 rounded-control border border-line bg-bg px-3 py-1 text-ink"
                      value={renaming.name}
                      maxLength={20}
                      autoFocus
                      onChange={(event) => setRenaming({ id: saved.id, name: event.target.value })}
                    />
                    <button type="submit" className={button}>
                      儲存稱呼
                    </button>
                    <button type="button" className={button} onClick={() => setRenaming(null)}>
                      取消
                    </button>
                  </form>
                ) : (
                  <p>
                    <Link to={`/chart/${saved.id}`} className="font-kai text-[1.25rem] font-bold underline decoration-line-soft underline-offset-4 hover:decoration-line">
                      {saved.input.name}
                    </Link>
                    {saved.pinned && <span className="ml-2 border border-line px-1 font-kai text-sm">已釘選</span>}
                  </p>
                )}
                <p className="text-sm text-ink-muted">
                  {saved.input.gender === 'male' ? '男' : '女'}　{birthday}
                </p>
                {soul && <p className="font-kai text-sm">命宮：{soul}</p>}
                <p className="text-sm text-ink-muted">最後開啟：{formatTime(saved.openedAt)}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {confirming === saved.id ? (
                  <>
                    <button type="button" onClick={() => void remove(saved.id)} className="rounded-control bg-danger px-3 py-1 font-kai text-bg">
                      確定刪除「{saved.input.name}」與它的對話
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className={button}>
                      保留
                    </button>
                  </>
                ) : (
                  <>
                    {/* 稱呼常常只有一兩個字，光靠它當連結不容易發現，所以另外放一顆明確的按鈕。 */}
                    <Link
                      to={`/chart/${saved.id}`}
                      className="rounded-control bg-accent px-4 py-1 font-kai font-bold text-accent-ink"
                      aria-label={`開啟命盤「${saved.input.name}」`}
                    >
                      開啟命盤
                    </Link>
                    <Link to={`/compare/${saved.id}`} className={button} aria-label={`用命盤「${saved.input.name}」合盤`}>
                      合盤
                    </Link>
                    <button
                      type="button"
                      className={button}
                      aria-pressed={saved.pinned === true}
                      aria-label={`${saved.pinned ? '取消釘選' : '釘選'}命盤「${saved.input.name}」`}
                      onClick={() => void change(saved.id, { pinned: !saved.pinned })}
                    >
                      {saved.pinned ? '取消釘選' : '釘選'}
                    </button>
                    <button
                      type="button"
                      className={button}
                      aria-label={`重新命名命盤「${saved.input.name}」`}
                      onClick={() => setRenaming({ id: saved.id, name: saved.input.name })}
                    >
                      重新命名
                    </button>
                    <button type="button" onClick={() => setConfirming(saved.id)} className={button} aria-label={`刪除命盤「${saved.input.name}」`}>
                      刪除命盤
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
