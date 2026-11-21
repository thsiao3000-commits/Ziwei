import type { LimitInfo, Limits } from './types';

export type Overlay = Limits['overlay'];

/** 疊宮的三層：盤上用一個字標示是哪一層。 */
const LAYERS = [
  { key: 'decadal', short: '限', name: '大限' },
  { key: 'yearly', short: '年', name: '流年' },
  { key: 'monthly', short: '月', name: '流月' },
] as const;

export type ActiveLayer = { short: string; name: string; limit: LimitInfo };

export function activeLayers(overlay: Overlay | undefined): ActiveLayer[] {
  if (!overlay) return [];
  return LAYERS.flatMap((layer) => {
    const limit = overlay[layer.key];
    return limit ? [{ short: layer.short, name: layer.name, limit }] : [];
  });
}

/** 運限四化落在這顆星上的標記，例如「限祿」「年忌」。 */
export function limitMarks(layers: readonly ActiveLayer[], starName: string): { text: string; label: string }[] {
  return layers.flatMap((layer) =>
    layer.limit.mutagens
      .filter((item) => item.star === starName)
      .map((item) => ({ text: `${layer.short}${item.mutagen}`, label: `${layer.name}化${item.mutagen}` })),
  );
}
