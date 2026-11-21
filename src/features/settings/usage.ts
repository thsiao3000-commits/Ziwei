import { estimateCostUSD, type PricingTable } from '../../lib/llm/pricing';
import type { ProviderId, Usage } from '../../lib/llm/types';
import { readItem, writeItem } from '../../lib/storage/local';

/**
 * AI 花費統計：每則回覆的 token 用量依月份與模型累計，只存本機（HANDOFF 第 4.4 節）。
 * 只記數量，不記提問或回覆的內容。
 */
export type UsageRow = {
  /** YYYY-MM */
  month: string;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** 回覆則數 */
  replies: number;
  /** 各則回覆當下估算的費用加總（美元） */
  costUSD?: number;
  /** 其中有幾則查無費率、沒算進費用 */
  unpriced?: number;
};

const STORAGE_KEY = 'usage';

export function readUsage(): UsageRow[] {
  try {
    const parsed: unknown = JSON.parse(readItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is UsageRow =>
        typeof row === 'object' && row !== null && typeof (row as UsageRow).month === 'string' && typeof (row as UsageRow).model === 'string',
    );
  } catch {
    return [];
  }
}

export function recordUsage(provider: ProviderId, model: string, usage: Usage, costUSD?: number | null, now: Date = new Date()): void {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rows = readUsage();
  let row = rows.find((item) => item.month === month && item.provider === provider && item.model === model);
  if (!row) {
    row = { month, provider, model, inputTokens: 0, outputTokens: 0, replies: 0, costUSD: 0, unpriced: 0 };
    rows.push(row);
  }
  row.inputTokens += usage.inputTokens;
  row.outputTokens += usage.outputTokens;
  row.replies += 1;
  if (typeof costUSD === 'number') row.costUSD = (row.costUSD ?? 0) + costUSD;
  else if (row.costUSD !== undefined) row.unpriced = (row.unpriced ?? 0) + 1;
  writeItem(STORAGE_KEY, JSON.stringify(rows));
}

export type MonthlyUsage = {
  month: string;
  rows: (UsageRow & { cost: number | null })[];
  /** 這個月可估算的花費合計（美元） */
  cost: number;
  /** 有沒有模型因為不認得單價而沒算進去 */
  hasUnknown: boolean;
};

/**
 * 依月份分組，新的月份在前。
 * 有記下當時費用的紀錄直接用；較舊、只有 token 數的紀錄用目前的價格表補估。
 */
export function usageByMonth(rows: readonly UsageRow[], table: PricingTable): MonthlyUsage[] {
  const months = new Map<string, MonthlyUsage>();
  for (const row of rows) {
    const recorded = typeof row.costUSD === 'number';
    const cost = recorded ? (row.costUSD ?? 0) : estimateCostUSD(table, row.model, row.inputTokens, row.outputTokens);
    const group = months.get(row.month) ?? { month: row.month, rows: [], cost: 0, hasUnknown: false };
    group.rows.push({ ...row, cost: recorded && (row.unpriced ?? 0) >= row.replies ? null : cost });
    if (cost === null || (row.unpriced ?? 0) > 0) group.hasUnknown = true;
    if (cost !== null) group.cost += cost;
    months.set(row.month, group);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}
