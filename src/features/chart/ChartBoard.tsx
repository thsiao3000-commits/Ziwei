import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { Density } from '../settings/preferences';
import { anchorPoint, GRID_POSITIONS, neighbour, palaceLabel, settleOrder } from './layout';
import type { ChartData, LimitInfo, Limits, Mutagen, PalaceInfo, StarInfo } from './types';

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

type Overlay = Limits['overlay'];

/** 疊宮的三層：盤上用一個字標示是哪一層。 */
const LAYERS = [
  { key: 'decadal', short: '限', name: '大限' },
  { key: 'yearly', short: '年', name: '流年' },
  { key: 'monthly', short: '月', name: '流月' },
] as const;

type ActiveLayer = { short: string; name: string; limit: LimitInfo };

function activeLayers(overlay: Overlay | undefined): ActiveLayer[] {
  if (!overlay) return [];
  return LAYERS.flatMap((layer) => {
    const limit = overlay[layer.key];
    return limit ? [{ short: layer.short, name: layer.name, limit }] : [];
  });
}

/** 運限四化落在這顆星上的標記，例如「限祿」「年忌」。 */
function limitMarks(layers: readonly ActiveLayer[], starName: string): { text: string; label: string }[] {
  return layers.flatMap((layer) =>
    layer.limit.mutagens
      .filter((item) => item.star === starName)
      .map((item) => ({ text: `${layer.short}${item.mutagen}`, label: `${layer.name}化${item.mutagen}` })),
  );
}

export function Star({ star, layers = [] }: { star: StarInfo; layers?: readonly ActiveLayer[] }) {
  // 全站唯一的紫色只給紫微星。
  const tone = star.name === '紫微' ? 'text-ziwei' : '';
  // 運限四化的標記放在星名外面，宮位窄的時候可以自己換行，不會被切掉。
  return (
    <>
      <span className={`star star-${star.kind} ${tone}`}>
        {star.name}
        {star.brightness && <span className="star-brightness">{star.brightness}</span>}
        {star.mutagen && <MutagenMark mutagen={star.mutagen} />}
      </span>
      {limitMarks(layers, star.name).map((mark) => (
        <span key={mark.text} className="hua-limit" title={mark.label}>
          {mark.text}
        </span>
      ))}
    </>
  );
}

type ContentProps = { chart: ChartData; palace: PalaceInfo; density: Density; layers: readonly ActiveLayer[] };

function PalaceContent({ chart, palace, density, layers }: ContentProps) {
  // 精簡：主星＋帶四化的星；標準：加輔星與大限；完整：全部。
  const marked = (star: StarInfo) => star.mutagen !== null || limitMarks(layers, star.name).length > 0;
  const minor = density === 'compact' ? palace.minorStars.filter(marked) : palace.minorStars;
  const borrowed = chart.palaces[palace.surrounded.opposite]?.majorStars ?? [];
  const flowing = layers.flatMap((layer) => layer.limit.stars[palace.index] ?? []);

  return (
    <span className="palace-content">
      <span className="palace-stars">
        {palace.majorStars.map((star) => (
          <Star key={star.name} star={star} layers={layers} />
        ))}
        {palace.isEmpty && density !== 'compact' && (
          <span className="palace-empty">借對宮 {borrowed.map((star) => star.name).join('、') || '無主星'}</span>
        )}
        {minor.map((star) => (
          <Star key={star.name} star={star} layers={layers} />
        ))}
        {density === 'full' &&
          palace.adjectiveStars.map((star) => <Star key={star.name} star={star} />)}
        {density !== 'compact' &&
          flowing.map((name) => (
            <span key={name} className="star star-flowing">
              {name}
            </span>
          ))}
      </span>

      {layers.length > 0 && (
        <span className="palace-limits">
          {layers.map((layer) => (
            <span key={layer.short} className={layer.limit.palaceIndex === palace.index ? 'limit-name is-soul' : 'limit-name'}>
              <span className="limit-layer">{layer.short}</span>
              {layer.limit.palaceNames[palace.index]}
            </span>
          ))}
        </span>
      )}

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

function overlayLabel(palace: PalaceInfo, layers: readonly ActiveLayer[]): string {
  if (layers.length === 0) return '';
  const parts = layers.map((layer) => {
    const stars = [...palace.majorStars, ...palace.minorStars].flatMap((star) =>
      layer.limit.mutagens.filter((item) => item.star === star.name).map((item) => `${star.name}化${item.mutagen}`),
    );
    return `${layer.name}${layer.limit.palaceNames[palace.index] ?? ''}${stars.length > 0 ? `，${stars.join('、')}` : ''}`;
  });
  return `。${parts.join('。')}`;
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
  /** 疊在本命盤上的運限 */
  overlay?: Overlay;
};

export function ChartBoard({ chart, density, selected, onSelect, centre, animate = false, label, overlay }: Props) {
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const layers = activeLayers(overlay);

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
      className={`chart-board density-${density}${animate ? ' chart-animate' : ''}${selected !== null ? ' has-selection' : ''}${layers.length > 0 ? ' has-overlay' : ''}`}
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
            aria-pressed={isSelected}
            tabIndex={palace.index === tabStop ? 0 : -1}
            onClick={() => onSelect(isSelected ? null : palace.index)}
            onKeyDown={(event) => onKeyDown(event, palace.index)}
            data-branch={palace.branch}
            data-related={isRelated && selected !== null ? 'true' : undefined}
          >
            {/* 朗讀名稱用完整的句子；畫面上的縮寫排版對報讀器隱藏，兩者不會重複唸。 */}
            <span className="sr-only">{`${palaceLabel(palace)}${overlayLabel(palace, layers)}`}</span>
            <span aria-hidden="true" className="contents">
              <PalaceContent chart={chart} palace={palace} density={density} layers={layers} />
            </span>
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
