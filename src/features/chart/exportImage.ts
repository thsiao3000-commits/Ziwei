import type { Density } from '../settings/preferences';
import { formatSolarDate, GRID_POSITIONS } from './layout';
import { activeLayers, limitMarks, type ActiveLayer, type Overlay } from './overlay';
import type { ChartData, Mutagen, PalaceInfo, StarInfo } from './types';

/**
 * 把命盤畫成 PNG。直接用 canvas 繪製，不把 HTML 轉成圖片：
 * 那種做法要經過 data: 圖片，會被本站的 CSP 擋下，也容易漏字型。
 * 整個過程都在瀏覽器裡完成，不會送出任何請求。
 */
export type ExportOptions = {
  chart: ChartData;
  name: string;
  density: Density;
  overlay?: Overlay;
  /** 連線要畫哪一宮的三方四正；沒有選宮位時畫命宮 */
  focus: number;
  /** 圖上不顯示稱呼、生日、時辰與四柱 */
  anonymous: boolean;
};

const KAI = '"LXGW WenKai TC", "BiauKai", "DFKai-SB", "Kaiti TC", serif';
const SERIF = '"Noto Serif TC", "Songti TC", "PMingLiU", serif';

const MARGIN = 40;
const CELL = 380;
const BOARD = CELL * 4;
const WIDTH = BOARD + MARGIN * 2;
const FOOTER = 70;
const HEIGHT = BOARD + MARGIN * 2 + FOOTER;
const PAD = 14;

const DISCLAIMER = '紫微斗數解讀僅供自我了解與參考，不能取代醫療、法律或財務專業意見。';

type Palette = {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  ziwei: string;
  danger: string;
  mutagen: Record<Mutagen, { bg: string; ink: string }>;
};

/** 顏色取自目前的佈景主題（design tokens），匯出的圖和畫面一致。 */
function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const bg = token('--bg', '#f7f9fa');
  return {
    bg,
    surface: token('--surface', '#dce8ee'),
    ink: token('--ink', '#14213d'),
    muted: token('--ink-muted', '#47536d'),
    line: token('--line', '#20408c'),
    ziwei: token('--ziwei', '#7a3fa0'),
    danger: token('--danger', '#b52f26'),
    mutagen: {
      祿: { bg: token('--hua-lu-bg', '#e0a526'), ink: token('--hua-lu-ink', '#14213d') },
      權: { bg: token('--hua-quan', '#236a9b'), ink: bg },
      科: { bg: token('--hua-ke', '#23745c'), ink: bg },
      忌: { bg: token('--hua-ji', '#b52f26'), ink: bg },
    },
  };
}

/** 一個可以排進宮位的小單位（星名、亮度、四化標記…），先量寬度再決定要不要換行。 */
type Piece = { width: number; height: number; draw: (x: number, baseline: number) => void };

function font(weight: 400 | 700, size: number, family = KAI): string {
  return `${weight} ${size}px ${family}`;
}

function textPiece(ctx: CanvasRenderingContext2D, text: string, fontSpec: string, size: number, colour: string): Piece {
  ctx.font = fontSpec;
  const width = ctx.measureText(text).width;
  return {
    width,
    height: size,
    draw(x, baseline) {
      ctx.font = fontSpec;
      ctx.fillStyle = colour;
      ctx.fillText(text, x, baseline);
    },
  };
}

/** 生年四化：實心小印。 */
function sealPiece(ctx: CanvasRenderingContext2D, mutagen: Mutagen, palette: Palette, size: number): Piece {
  const box = Math.round(size * 1.25);
  return {
    width: box,
    height: box,
    draw(x, baseline) {
      const top = baseline - box + Math.round(box * 0.12);
      ctx.fillStyle = palette.mutagen[mutagen].bg;
      ctx.fillRect(x, top, box, box);
      ctx.font = font(700, size);
      ctx.fillStyle = palette.mutagen[mutagen].ink;
      ctx.textAlign = 'center';
      ctx.fillText(mutagen, x + box / 2, top + box - Math.round(box * 0.2));
      ctx.textAlign = 'left';
    },
  };
}

/** 外框加文字：運限四化（限祿、年忌）、身宮、運限命宮。 */
function boxedPiece(ctx: CanvasRenderingContext2D, text: string, size: number, colour: string): Piece {
  ctx.font = font(400, size);
  const inner = ctx.measureText(text).width;
  const width = inner + 8;
  const height = Math.round(size * 1.3);
  return {
    width,
    height,
    draw(x, baseline) {
      const top = baseline - height + Math.round(height * 0.18);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, top + 0.75, width - 1.5, height - 1.5);
      ctx.font = font(400, size);
      ctx.fillStyle = colour;
      ctx.fillText(text, x + 4, baseline - 1);
    },
  };
}

/** 幾個小單位黏在一起、不能被換行拆開（例如「紫微」＋「廟」＋四化）。 */
function group(pieces: Piece[], gap = 2): Piece {
  const width = pieces.reduce((sum, piece) => sum + piece.width, 0) + gap * Math.max(0, pieces.length - 1);
  return {
    width,
    height: Math.max(...pieces.map((piece) => piece.height)),
    draw(x, baseline) {
      let cursor = x;
      for (const piece of pieces) {
        piece.draw(cursor, baseline);
        cursor += piece.width + gap;
      }
    },
  };
}

/** 由左到右排，放不下就換行。回傳排完後的下緣位置。 */
function flow(pieces: Piece[], x: number, top: number, maxWidth: number, gapX: number, gapY: number): number {
  let cursorX = x;
  let lineTop = top;
  let lineHeight = 0;
  let line: { piece: Piece; x: number }[] = [];
  const flush = () => {
    for (const item of line) item.piece.draw(item.x, lineTop + lineHeight);
    line = [];
  };
  for (const piece of pieces) {
    if (cursorX > x && cursorX + piece.width > x + maxWidth) {
      flush();
      lineTop += lineHeight + gapY;
      cursorX = x;
      lineHeight = 0;
    }
    line.push({ piece, x: cursorX });
    cursorX += piece.width + gapX;
    lineHeight = Math.max(lineHeight, piece.height);
  }
  flush();
  return lineTop + lineHeight;
}

function starPieces(ctx: CanvasRenderingContext2D, star: StarInfo, palette: Palette, layers: readonly ActiveLayer[]): Piece[] {
  const size = star.kind === 'major' ? 34 : star.kind === 'minor' ? 25 : 20;
  const weight = star.kind === 'major' ? 700 : 400;
  const colour = star.name === '紫微' ? palette.ziwei : star.kind === 'adjective' ? palette.muted : palette.ink;
  const parts: Piece[] = [textPiece(ctx, star.name, font(weight, size), size, colour)];
  if (star.brightness) parts.push(textPiece(ctx, star.brightness, font(400, Math.round(size * 0.6)), size, palette.muted));
  if (star.mutagen) parts.push(sealPiece(ctx, star.mutagen, palette, Math.round(size * 0.62)));
  // 運限四化各自是獨立的單位，宮位窄時可以換到下一行。
  return [group(parts), ...limitMarks(layers, star.name).map((mark) => boxedPiece(ctx, mark.text, 18, palette.ink))];
}

function drawPalace(
  ctx: CanvasRenderingContext2D,
  chart: ChartData,
  palace: PalaceInfo,
  options: { density: Density; layers: readonly ActiveLayer[]; highlighted: boolean },
  palette: Palette,
  x: number,
  y: number,
) {
  const { density, layers, highlighted } = options;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, CELL, CELL);
  ctx.clip();

  if (highlighted) {
    ctx.fillStyle = palette.surface;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.globalAlpha = 1;
  }

  const innerX = x + PAD;
  const innerWidth = CELL - PAD * 2;
  const marked = (star: StarInfo) => star.mutagen !== null || limitMarks(layers, star.name).length > 0;

  const pieces: Piece[] = [];
  for (const star of palace.majorStars) pieces.push(...starPieces(ctx, star, palette, layers));
  if (palace.isEmpty && density !== 'compact') {
    const borrowed = chart.palaces[palace.surrounded.opposite]?.majorStars.map((star) => star.name).join('、') || '無主星';
    pieces.push(textPiece(ctx, `借對宮 ${borrowed}`, font(400, 20), 26, palette.muted));
  }
  for (const star of density === 'compact' ? palace.minorStars.filter(marked) : palace.minorStars) {
    pieces.push(...starPieces(ctx, star, palette, layers));
  }
  if (density === 'full') {
    for (const star of palace.adjectiveStars) pieces.push(...starPieces(ctx, star, palette, layers));
  }
  if (density !== 'compact') {
    for (const layer of layers) {
      for (const name of layer.limit.stars[palace.index] ?? []) pieces.push(textPiece(ctx, name, font(400, 18), 22, palette.muted));
    }
  }
  flow(pieces, innerX, y + PAD, innerWidth, 12, 8);

  // 由下往上：宮名列、運限宮名、十二神。
  let baseline = y + CELL - PAD;

  ctx.textAlign = 'right';
  ctx.font = font(400, 20);
  ctx.fillStyle = palette.muted;
  ctx.fillText(density === 'compact' ? palace.branch : `${palace.stem}${palace.branch}`, x + CELL - PAD, baseline);
  ctx.textAlign = 'left';

  const nameParts: Piece[] = [textPiece(ctx, palace.name, font(700, 30), 30, palette.ink)];
  if (palace.isBodyPalace) nameParts.push(boxedPiece(ctx, '身', 18, palette.danger));
  const nameGroup = group(nameParts, 6);
  nameGroup.draw(innerX, baseline);

  if (density !== 'compact') {
    ctx.textAlign = 'center';
    ctx.font = font(400, 20);
    ctx.fillStyle = palette.muted;
    ctx.fillText(`${palace.decadalRange[0]}–${palace.decadalRange[1]}`, x + CELL / 2 + 18, baseline);
    ctx.textAlign = 'left';
  }
  baseline -= 42;

  if (layers.length > 0) {
    const limitPieces = layers.map((layer) => {
      const text = `${layer.short}${layer.limit.palaceNames[palace.index] ?? ''}`;
      return layer.limit.palaceIndex === palace.index
        ? boxedPiece(ctx, text, 19, palette.ink)
        : textPiece(ctx, text, font(400, 19), 24, palette.ink);
    });
    group(limitPieces, 10).draw(innerX, baseline);
    baseline -= 30;
  }

  if (density === 'full') {
    ctx.font = font(400, 18);
    ctx.fillStyle = palette.muted;
    ctx.fillText(`${palace.changsheng12}・${palace.boshi12}`, innerX, baseline);
  }

  ctx.restore();
}

function cellOrigin(index: number): { x: number; y: number } {
  const pos = GRID_POSITIONS[index] ?? { row: 1, col: 1 };
  return { x: MARGIN + (pos.col - 1) * CELL, y: MARGIN + (pos.row - 1) * CELL };
}

/** 宮位朝向中宮的那一點（落在中宮方框的邊上）。 */
function anchor(index: number): { x: number; y: number } {
  const origin = cellOrigin(index);
  const clamp = (value: number) => Math.min(MARGIN + CELL * 3, Math.max(MARGIN + CELL, value));
  return { x: clamp(origin.x + CELL / 2), y: clamp(origin.y + CELL / 2) };
}

function drawCentre(ctx: CanvasRenderingContext2D, options: ExportOptions, palette: Palette) {
  const { chart, name, anonymous } = options;
  const left = MARGIN + CELL + 64;
  const gender = chart.gender === 'male' ? '男' : '女';
  const lines: { text: string; bold?: boolean }[] = anonymous
    ? [{ text: `${gender}命`, bold: true }, { text: chart.fiveElementsClass }, { text: `命主 ${chart.soul}　身主 ${chart.body}` }]
    : [
        { text: `${name}　${gender}`, bold: true },
        { text: `國曆 ${formatSolarDate(chart.solarDate)}` },
        { text: `農曆 ${chart.lunarDate}` },
        { text: `${chart.time}　${chart.fiveElementsClass}` },
        { text: chart.fourPillars },
        { text: `命主 ${chart.soul}　身主 ${chart.body}` },
      ];
  const lineHeight = 54;
  let baseline = MARGIN + CELL * 2 - ((lines.length - 1) * lineHeight) / 2 + 10;
  for (const line of lines) {
    ctx.font = font(line.bold ? 700 : 400, line.bold ? 38 : 32);
    ctx.fillStyle = palette.ink;
    ctx.fillText(line.text, left, baseline);
    baseline += lineHeight;
  }
  ctx.font = font(400, 20);
  ctx.fillStyle = palette.muted;
  ctx.fillText(`紫微命盤　排盤 iztro ${chart.iztroVersion}`, left, MARGIN + CELL * 3 - 28);
}

function drawChart(ctx: CanvasRenderingContext2D, options: ExportOptions, palette: Palette) {
  const { chart, density } = options;
  const layers = activeLayers(options.overlay);

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const focus = chart.palaces[options.focus] ?? chart.palaces[chart.soulPalaceIndex];
  const related = focus
    ? new Set([focus.index, focus.surrounded.opposite, focus.surrounded.wealth, focus.surrounded.career])
    : new Set<number>();
  const selectedByUser = options.focus !== chart.soulPalaceIndex;

  for (const palace of chart.palaces) {
    const origin = cellOrigin(palace.index);
    drawPalace(ctx, chart, palace, { density, layers, highlighted: selectedByUser && related.has(palace.index) }, palette, origin.x, origin.y);
  }

  // 三方四正連線：只經過中宮。
  if (focus) {
    const triangle = [focus.index, focus.surrounded.wealth, focus.surrounded.career].map(anchor);
    const opposite = anchor(focus.surrounded.opposite);
    const start = anchor(focus.index);
    ctx.strokeStyle = palette.line;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    triangle.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(opposite.x, opposite.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawCentre(ctx, options, palette);

  // 格線最後畫，蓋在底色與連線上面。
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN, MARGIN, BOARD, BOARD);
  ctx.beginPath();
  for (const palace of chart.palaces) {
    const origin = cellOrigin(palace.index);
    ctx.rect(origin.x, origin.y, CELL, CELL);
  }
  ctx.stroke();

  ctx.font = `400 20px ${SERIF}`;
  ctx.fillStyle = palette.muted;
  ctx.fillText(DISCLAIMER, MARGIN, MARGIN + BOARD + 44);
}

/** 圖上會用到的所有字，用來確保對應的字型分片都載入了。 */
function allText(options: ExportOptions): string {
  const { chart } = options;
  const parts: string[] = [options.name, chart.lunarDate, chart.fourPillars, chart.time, chart.fiveElementsClass, chart.soul, chart.body, DISCLAIMER];
  for (const palace of chart.palaces) {
    parts.push(palace.name, palace.stem, palace.branch, palace.changsheng12, palace.boshi12);
    for (const star of [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars]) parts.push(star.name, star.brightness);
  }
  for (const layer of activeLayers(options.overlay)) {
    parts.push(layer.short, ...layer.limit.palaceNames, ...layer.limit.stars.flat());
  }
  return `${[...new Set(parts.join(''))].join('')}男女命國曆農年月日借對宮身主限祿權科忌排盤紫微無星0123456789–・`;
}

async function loadFonts(text: string): Promise<void> {
  if (!document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`400 24px "LXGW WenKai TC"`, text),
      document.fonts.load(`700 24px "LXGW WenKai TC"`, text),
      document.fonts.load(`400 20px "Noto Serif TC"`, text),
    ]);
  } catch {
    // 字型載不到就用系統後備字型畫，圖還是出得來。
  }
}

/** 產生命盤圖（PNG）。失敗時丟出錯誤。 */
export async function renderChartImage(options: ExportOptions): Promise<Blob> {
  await loadFonts(allText(options));
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  drawChart(ctx, options, readPalette());
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export const CHART_IMAGE_SIZE = { width: WIDTH, height: HEIGHT };
