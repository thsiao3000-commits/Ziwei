import { getDB } from '../../lib/storage/db';
import type { BirthInput, ChartSettings, SavedChart } from './types';

/** 本機產生的隨機 id，只用來在這台裝置上找到命盤，不含任何出生資料。 */
function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

/** 只保存使用者輸入與排盤設定，不保存計算結果（HANDOFF 第 7.5 節）。 */
export async function saveChart(input: BirthInput, chartSettings: ChartSettings): Promise<SavedChart> {
  const now = new Date().toISOString();
  const chart: SavedChart = {
    id: newId(),
    input: { ...input },
    chartSettings: { ...chartSettings },
    createdAt: now,
    updatedAt: now,
  };
  await (await getDB()).put('charts', chart);
  return chart;
}

export async function getChart(id: string): Promise<SavedChart | undefined> {
  return (await getDB()).get('charts', id);
}

/** 換時辰：原本輸入的時鐘時間不再適用，一併拿掉。 */
function withTime(input: BirthInput, timeIndex: number): BirthInput {
  const { clockTime: _clockTime, ...rest } = input;
  void _clockTime;
  return { ...rest, timeIndex };
}

/** 修改命盤記錄（重新命名、釘選、改用新的排盤設定、改時辰）。找不到時回傳 undefined。 */
export async function updateChart(
  id: string,
  patch: { name?: string; pinned?: boolean; chartSettings?: ChartSettings; timeIndex?: number },
): Promise<SavedChart | undefined> {
  const db = await getDB();
  const current = await db.get('charts', id);
  if (!current) return undefined;
  const next: SavedChart = {
    ...current,
    ...(patch.name !== undefined ? { input: { ...current.input, name: patch.name.trim() || current.input.name } } : {}),
    ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
    ...(patch.timeIndex !== undefined ? { input: withTime(current.input, patch.timeIndex) } : {}),
    ...(patch.chartSettings ? { chartSettings: { ...patch.chartSettings } } : {}),
    updatedAt: new Date().toISOString(),
  };
  await db.put('charts', next);
  return next;
}

/** 記下最後開啟時間。 */
export async function touchChart(id: string): Promise<void> {
  const db = await getDB();
  const current = await db.get('charts', id);
  if (current) await db.put('charts', { ...current, openedAt: new Date().toISOString() });
}

/** 釘選的在前，其餘依最後開啟（沒開過就用建立時間）新到舊。 */
export async function listCharts(): Promise<SavedChart[]> {
  const charts = await (await getDB()).getAll('charts');
  const recent = (chart: SavedChart) => chart.openedAt ?? chart.createdAt;
  return charts.sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || recent(b).localeCompare(recent(a)));
}

/** 最近開啟的幾張命盤：只看最後開啟（沒開過就用建立時間），不管有沒有釘選。 */
export async function recentCharts(limit: number): Promise<SavedChart[]> {
  const charts = await (await getDB()).getAll('charts');
  const recent = (chart: SavedChart) => chart.openedAt ?? chart.createdAt;
  return charts.sort((a, b) => recent(b).localeCompare(recent(a))).slice(0, limit);
}

/** 刪除命盤與它的所有對話（含用到這張盤的合盤對話）。 */
export async function deleteChart(id: string): Promise<void> {
  const db = await getDB();
  const own = await db.getAllKeysFromIndex('conversations', 'chartId', id);
  // 合盤對話的索引鍵是「compare:甲:乙」，其中一張盤刪掉了就沒有意義。
  const compared = (await db.getAll('conversations'))
    .filter((item) => item.chartId.startsWith('compare:') && item.chartId.split(':').includes(id))
    .map((item) => item.id);
  const keys = [...new Set([...own, ...compared])];
  const tx = db.transaction(['charts', 'conversations'], 'readwrite');
  await Promise.all([
    tx.objectStore('charts').delete(id),
    ...keys.map((key) => tx.objectStore('conversations').delete(key)),
    tx.done,
  ]);
}
