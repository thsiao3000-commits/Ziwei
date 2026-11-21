import type { ChartData, PalaceInfo, StarInfo } from './types';

/**
 * 十二宮在 4×4 方格上的位置。索引與 engine 輸出的 palaces 相同（0 是寅宮）。
 *
 *   巳 午 未 申
 *   辰  中宮  酉
 *   卯       戌
 *   寅 丑 子 亥
 */
export const GRID_POSITIONS: readonly { row: number; col: number }[] = [
  { row: 4, col: 1 }, // 寅
  { row: 3, col: 1 }, // 卯
  { row: 2, col: 1 }, // 辰
  { row: 1, col: 1 }, // 巳
  { row: 1, col: 2 }, // 午
  { row: 1, col: 3 }, // 未
  { row: 1, col: 4 }, // 申
  { row: 2, col: 4 }, // 酉
  { row: 3, col: 4 }, // 戌
  { row: 4, col: 4 }, // 亥
  { row: 4, col: 3 }, // 子
  { row: 4, col: 2 }, // 丑
];

function indexAt(row: number, col: number): number {
  return GRID_POSITIONS.findIndex((pos) => pos.row === row && pos.col === col);
}

/** 方向鍵移動：往該方向找下一個宮位，會跨過中宮；到邊界就留在原地。 */
export function neighbour(index: number, dRow: number, dCol: number): number {
  const start = GRID_POSITIONS[index];
  if (!start) return index;
  let row = start.row + dRow;
  let col = start.col + dCol;
  while (row >= 1 && row <= 4 && col >= 1 && col <= 4) {
    const found = indexAt(row, col);
    if (found !== -1) return found;
    row += dRow;
    col += dCol;
  }
  return index;
}

/**
 * 三方四正連線的端點：取宮位朝向中宮的那一點（落在中宮方框的邊上），
 * 連線只經過中宮，不會壓到其他宮位的星曜。座標以格為單位（0–4）。
 */
export function anchorPoint(index: number): { x: number; y: number } {
  const pos = GRID_POSITIONS[index] ?? { row: 1, col: 1 };
  const clamp = (value: number) => Math.min(3, Math.max(1, value));
  return { x: clamp(pos.col - 0.5), y: clamp(pos.row - 0.5) };
}

/** 從命宮開始、依十二宮順序的落位次序（首次排盤動畫用）。 */
export function settleOrder(chart: ChartData, index: number): number {
  return (chart.soulPalaceIndex - index + 12) % 12;
}

export function starText(star: StarInfo): string {
  const brightness = star.brightness ? `（${star.brightness}）` : '';
  const mutagen = star.mutagen ? `化${star.mutagen}` : '';
  return `${star.name}${brightness}${mutagen}`;
}

/** 給螢幕報讀器的完整宮位描述。 */
export function palaceLabel(palace: PalaceInfo): string {
  const parts = [`${palace.name}，${palace.stem}${palace.branch}`];
  if (palace.isBodyPalace) parts.push('身宮');
  parts.push(
    palace.majorStars.length > 0 ? `主星：${palace.majorStars.map(starText).join('、')}` : '沒有主星（空宮）',
  );
  if (palace.minorStars.length > 0) parts.push(`輔星：${palace.minorStars.map(starText).join('、')}`);
  if (palace.adjectiveStars.length > 0) parts.push(`雜曜：${palace.adjectiveStars.map((star) => star.name).join('、')}`);
  parts.push(`大限 ${palace.decadalRange[0]} 到 ${palace.decadalRange[1]} 歲`);
  return parts.join('。');
}

/** 「2000-8-16」→「2000 年 8 月 16 日」 */
export function formatSolarDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

/** 命宮主星摘要，例如「紫微、天府」；空宮時為「空宮」。 */
export function soulSummary(chart: ChartData): string {
  const soul = chart.palaces[chart.soulPalaceIndex];
  if (!soul || soul.majorStars.length === 0) return '空宮';
  return soul.majorStars.map((star) => star.name).join('、');
}
