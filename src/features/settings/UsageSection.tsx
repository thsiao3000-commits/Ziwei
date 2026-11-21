import { useState } from 'react';
import { PRICES_AS_OF } from '../../lib/llm/models.config';
import { PROVIDER_NAMES } from '../../lib/llm/types';
import { readUsage, usageByMonth } from './usage';
import { legendClass } from './ui';

function dollars(value: number): string {
  return `US$${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}`;
}

/** AI 花費統計：依月份與模型列出 token 用量與估算花費。只存本機。 */
export function UsageSection() {
  const [months] = useState(() => usageByMonth(readUsage()));

  return (
    <div>
      <p className={legendClass}>AI 花費統計</p>
      <p className="max-w-[34em] text-sm text-ink-muted">
        依這台裝置上每則回覆的 token 用量估算，只記數量，不記內容。金額以 {PRICES_AS_OF} 的官方單價計算，不含快取折扣與匯率，實際帳單以供應商為準。
      </p>

      {months.length === 0 ? (
        <p className="mt-2">還沒有用量紀錄。提問後，這裡會列出各月的用量。</p>
      ) : (
        <div className="mt-3 grid gap-5">
          {months.map((month) => (
            <table key={month.month} className="w-full max-w-[40rem] border-collapse text-[0.9375rem]">
              <caption className="pb-1 text-left font-kai text-[1.0625rem] font-bold">
                {month.month.replace('-', ' 年 ')} 月　估算 {dollars(month.cost)}
                {month.hasUnknown && <span className="font-serif text-sm font-normal text-ink-muted">（不含沒有單價的模型）</span>}
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
                    <td className="py-1 text-right align-top">{row.cost === null ? '沒有單價' : dollars(row.cost)}</td>
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
