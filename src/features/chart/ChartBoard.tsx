import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { Density } from '../settings/preferences';
import { anchorPoint, GRID_POSITIONS, neighbour, palaceLabel, settleOrder } from './layout';
import type { ChartData, Mutagen, PalaceInfo, StarInfo } from './types';

const MUTAGEN_CLASS: Record<Mutagen, string> = {
  祿: 'hua hua-lu',
  權: 'hua hua-quan',
  科: 'hua hua-ke',
  忌: 'hua hua-ji',
};

/** 四化標記：同時有文字與顏色，不只靠顏色區分。 */
export function MutagenMark({ mutagen }: { mutagen: Mutagen }) {
  return (
    <span className={MUTAGEN_CLASS[mutagen]}>
      <span className="sr-only">化</span>
      {mutagen}
    </span>
  );
}

export function Star({ star }: { star: StarInfo }) {
  // 全站唯一的紫色只給紫微星。
  const tone = star.name === '紫微' ? 'text-ziwei' : '';
  return (
    <span className={`star star-${star.kind} ${tone}`}>
      {star.name}
      {star.brightness && <span className="star-brightness">{star.brightness}</span>}
      {star.mutagen && <MutagenMark mutagen={star.mutagen} />}
    </span>
  );
}

function PalaceContent({ palace, density }: { palace: PalaceInfo; density: Density }) {
  // 精簡：主星＋帶生年四化的星；標準：加輔星與大限；完整：全部。
  const minor = density === 'compact' ? palace.minorStars.filter((star) => star.mutagen) : palace.minorStars;

  return (
    <span className="palace-content">
      <span className="palace-stars">
        {palace.majorStars.map((star) => (
          <Star key={star.name} star={star} />
        ))}
        {palace.majorStars.length === 0 && density !== 'compact' && <span className="palace-empty">空宮</span>}
        {minor.map((star) => (
          <Star key={star.name} star={star} />
        ))}
        {density === 'full' &&
          palace.adjectiveStars.map((star) => <Star key={star.name} star={star} />)}
      </span>

      {density === 'full' && (
        <span className="palace-gods">
          {palace.changsheng12}・{palace.boshi12}
        </span>
      )}

      <span className="palace-foot">
        <span className="palace-name">
          {palace.name}
          {palace.isBodyPalace && <span className="palace-body">身</span>}
        </span>
        {density !== 'compact' && (
          <span className="palace-decadal">
            {palace.decadalRange[0]}–{palace.decadalRange[1]}
          </span>
        )}
        <span className="palace-branch">
          {density !== 'compact' && <span className="palace-stem">{palace.stem}</span>}
          {palace.branch}
        </span>
      </span>
    </span>
  );
}

type Props = {
  chart: ChartData;
  density: Density;
  /** 選中的宮位索引；null 表示沒有選 */
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** 中宮內容 */
  centre: ReactNode;
  /** 首次排出時播放落位動畫 */
  animate?: boolean;
  label: string;
};

export function ChartBoard({ chart, density, selected, onSelect, centre, animate = false, label }: Props) {
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  // 沒選宮位時，連線畫命宮的三方四正，但不淡化其他宮位。
  const focus = selected ?? chart.soulPalaceIndex;
  const focusPalace = chart.palaces[focus];
  const related = focusPalace
    ? new Set([focus, focusPalace.surrounded.opposite, focusPalace.surrounded.wealth, focusPalace.surrounded.career])
    : new Set<number>();

  const tabStop = selected ?? chart.soulPalaceIndex;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      cells.current[neighbour(index, move[0], move[1])]?.focus();
    } else if (event.key === 'Escape' && selected !== null) {
      onSelect(null);
    }
  }

  const target = anchorPoint(focus);
  const lines = focusPalace
    ? {
        triangle: [focus, focusPalace.surrounded.wealth, focusPalace.surrounded.career]
          .map((i) => anchorPoint(i))
          .map((p) => `${p.x},${p.y}`)
          .join(' '),
        opposite: anchorPoint(focusPalace.surrounded.opposite),
      }
    : null;

  return (
    <div className="chart-frame">
    <div
      role="group"
      aria-label={label}
      className={`chart-board density-${density}${animate ? ' chart-animate' : ''}${selected !== null ? ' has-selection' : ''}`}
    >
      {chart.palaces.map((palace) => {
        const pos = GRID_POSITIONS[palace.index];
        const isSelected = selected === palace.index;
        const isRelated = related.has(palace.index);
        return (
          <button
            key={palace.index}
            ref={(el) => {
              cells.current[palace.index] = el;
            }}
            type="button"
            className={`palace${isSelected ? ' is-selected' : ''}${isRelated ? ' is-related' : ''}`}
            style={
              {
                gridRow: pos?.row,
                gridColumn: pos?.col,
                '--order': settleOrder(chart, palace.index),
              } as CSSProperties
            }
            aria-label={palaceLabel(palace)}
            aria-pressed={isSelected}
            tabIndex={palace.index === tabStop ? 0 : -1}
            onClick={() => onSelect(isSelected ? null : palace.index)}
            onKeyDown={(event) => onKeyDown(event, palace.index)}
            data-branch={palace.branch}
            data-related={isRelated && selected !== null ? 'true' : undefined}
          >
            <PalaceContent palace={palace} density={density} />
          </button>
        );
      })}

      <div className="chart-centre">{centre}</div>

      {lines && (
        <svg className="chart-lines" viewBox="0 0 4 4" preserveAspectRatio="none" aria-hidden="true">
          <polygon points={lines.triangle} />
          <line x1={target.x} y1={target.y} x2={lines.opposite.x} y2={lines.opposite.y} />
        </svg>
      )}
    </div>
    </div>
  );
}
