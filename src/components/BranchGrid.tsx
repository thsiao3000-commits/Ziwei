/**
 * 命盤的空白格線：十二宮依地支固定在外圈，中間 2×2 是中宮。
 * 這裡只畫格線與地支（固定不變的版面），不含任何排盤結果；
 * 星曜一律由 features/chart/engine.ts 計算（M1）。
 *
 *   巳 午 未 申
 *   辰  中宮  酉
 *   卯       戌
 *   寅 丑 子 亥
 */
const CELLS = [
  { branch: '巳', row: 1, col: 1 },
  { branch: '午', row: 1, col: 2 },
  { branch: '未', row: 1, col: 3 },
  { branch: '申', row: 1, col: 4 },
  { branch: '酉', row: 2, col: 4 },
  { branch: '戌', row: 3, col: 4 },
  { branch: '亥', row: 4, col: 4 },
  { branch: '子', row: 4, col: 3 },
  { branch: '丑', row: 4, col: 2 },
  { branch: '寅', row: 4, col: 1 },
  { branch: '卯', row: 3, col: 1 },
  { branch: '辰', row: 2, col: 1 },
] as const;

export function BranchGrid({ centre }: { centre: string }) {
  return (
    <div
      role="img"
      aria-label="命盤格線：十二宮依地支排在外圈，中間是中宮"
      className="grid aspect-square w-full grid-cols-4 grid-rows-4 border-l border-t border-line font-kai"
    >
      {CELLS.map((cell) => (
        <div
          key={cell.branch}
          style={{ gridRow: cell.row, gridColumn: cell.col }}
          className="flex items-end justify-end border-b border-r border-line p-1.5 text-[0.9375rem] leading-none text-ink-muted md:p-2.5 md:text-base"
        >
          {cell.branch}
        </div>
      ))}
      <div
        style={{ gridRow: '2 / span 2', gridColumn: '2 / span 2' }}
        className="flex items-center justify-center border-b border-r border-line p-3 text-center text-[0.9375rem] leading-relaxed text-ink-muted md:text-base"
      >
        {centre}
      </div>
    </div>
  );
}
