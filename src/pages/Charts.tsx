import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { computeChart } from '../features/chart/engine';
import { formatSolarDate, soulSummary } from '../features/chart/layout';
import { deleteChart, listCharts } from '../features/chart/store';
import { timeSlotLabel } from '../features/chart/time';
import type { SavedChart } from '../features/chart/types';

type Row = { saved: SavedChart; birthday: string; soul: string };

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

export function Charts() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

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
        <ul className="mt-6 max-w-[44rem] border-t border-line-soft">
          {rows.map(({ saved, birthday, soul }) => (
            <li key={saved.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line-soft py-4">
              <div className="min-w-0">
                <Link to={`/chart/${saved.id}`} className="font-kai text-[1.25rem] font-bold underline-offset-4 hover:underline">
                  {saved.input.name}
                </Link>
                <p className="text-sm text-ink-muted">
                  {saved.input.gender === 'male' ? '男' : '女'}　{birthday}
                </p>
                {soul && <p className="font-kai text-sm">命宮：{soul}</p>}
              </div>
              {confirming === saved.id ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void remove(saved.id)}
                    className="rounded-control bg-danger px-3 py-1 font-kai text-bg"
                  >
                    確定刪除「{saved.input.name}」
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="rounded-control border border-line px-3 py-1 font-kai">
                    保留
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(saved.id)}
                  className="rounded-control border border-line px-3 py-1 font-kai"
                  aria-label={`刪除命盤「${saved.input.name}」`}
                >
                  刪除命盤
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
