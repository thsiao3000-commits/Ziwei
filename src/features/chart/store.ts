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

/** 最近開啟或修改的排在前面。 */
export async function listCharts(): Promise<SavedChart[]> {
  const charts = await (await getDB()).getAll('charts');
  return charts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 刪除命盤與它的所有對話。 */
export async function deleteChart(id: string): Promise<void> {
  const db = await getDB();
  const keys = await db.getAllKeysFromIndex('conversations', 'chartId', id);
  const tx = db.transaction(['charts', 'conversations'], 'readwrite');
  await Promise.all([
    tx.objectStore('charts').delete(id),
    ...keys.map((key) => tx.objectStore('conversations').delete(key)),
    tx.done,
  ]);
}
