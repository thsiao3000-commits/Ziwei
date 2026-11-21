import { useEffect, useState } from 'react';
import { formatUSD, loadPricing, PRICING_PAGE_PATH, type LoadedPricing } from '../../lib/llm/pricing';
import { PROVIDER_NAMES } from '../../lib/llm/types';
import { readUsage, usageByMonth } from './usage';
import { legendClass } from './ui';

/** AI 花費統計：依月份與模型列出 token 用量與估算花費。只存本機。 */
export function UsageSection() {
  const [rows] = useState(readUsage);
  const [pricing, setPricing] = useState<LoadedPricing | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPricing().then((loaded) => {
      if (!cancelled) setPricing(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const months = pricing ? usageByMonth(rows, pricing.table) : [];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className={legendClass}>AI 花費統計</p>
        <a href={PRICING_PAGE_PATH} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline underline-offset-4">
          模型價目表（另開分頁）
        </a>
      </div>
      <p className="max-w-[34em] text-sm text-ink-muted">
        依這台裝置上每則回覆的 token 用量估算，只記數量，不記內容。費用在回覆當下依價目表計算（含長文加價與限時優惠），不含快取折扣與匯率，實際帳單以供應商為準。
      </p>
      <p className="max-w-[34em] text-sm text-ink-muted" aria-live="polite">
        {pricing === null
          ? '讀取價目表中'
          : pricing.source === 'online'
            ? `價目表：線上版，更新於 ${pricing.table.updated_at}。`
            : `價目表：抓不到線上版，改用內建的後備表（${pricing.table.updated_at}）。`}
      </p>

      {pricing !== null && months.length === 0 && <p className="mt-2">還沒有用量紀錄。提問後，這裡會列出各月的用量。</p>}

      {months.length > 0 && (
        <div className="mt-3 grid gap-5">
          {months.map((month) => (
            <table key={month.month} className="w-full max-w-[40rem] border-collapse text-[0.9375rem]">
              <caption className="pb-1 text-left font-kai text-[1.0625rem] font-bold">
                {month.month.replace('-', ' 年 ')} 月　約 {formatUSD(month.cost)}
                {month.hasUnknown && <span className="font-serif text-sm font-normal text-ink-muted">（不含費率未知的回覆）</span>}
              </caption>
              <thead>
                <tr className="border-b border-line text-left font-kai">
                  <th scope="col" className="py-1 pr-3 font-normal text-ink-muted">模型</th>
                  <th scope="col" className="py-1 pr-3 text-right font-normal text-ink-muted">回覆</th>
                  <th scope="col" className="py-1 pr-3 text-right font-normal text-ink-muted">輸入</th>
                  <th scope="col" className="py-1 pr-3 text-right font-normal text-ink-muted">輸出</th>
                  <th scope="col" className="py-1 text-right font-normal text-ink-muted">估算</th>
                </tr>
              </thead>
              <tbody>
                {month.rows.map((row) => (
                  <tr key={`${row.provider}-${row.model}`} className="border-b border-line-soft">
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      {row.model}
                      <span className="block text-sm text-ink-muted">{PROVIDER_NAMES[row.provider]}</span>
                    </th>
                    <td className="py-1 pr-3 text-right align-top">{row.replies}</td>
                    <td className="py-1 pr-3 text-right align-top">{row.inputTokens.toLocaleString()}</td>
                    <td className="py-1 pr-3 text-right align-top">{row.outputTokens.toLocaleString()}</td>
                    <td className="py-1 text-right align-top">{row.cost === null ? '費率未知' : `約 ${formatUSD(row.cost)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}
    </div>
  );
}
