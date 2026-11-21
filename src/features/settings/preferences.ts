import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { prefixed } from '../../lib/storage/keys';

export const DENSITIES = [
  { value: 'compact', label: '精簡', hint: '主星與四化' },
  { value: 'standard', label: '標準', hint: '加上輔星與大限' },
  { value: 'full', label: '完整', hint: '全部星曜與十二神' },
] as const;

export type Density = (typeof DENSITIES)[number]['value'];

type Preferences = {
  /** null 表示還沒選過：手機用精簡，桌機用標準 */
  density: Density | null;
  setDensity: (density: Density) => void;
};

export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      density: null,
      setDensity: (density) => set({ density }),
    }),
    {
      name: prefixed('preferences'),
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({ density: state.density }),
    },
  ),
);

/** 沒選過密度時的預設：手機精簡（HANDOFF 第 3.2 節）。 */
export function defaultDensity(): Density {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) return 'compact';
  return 'standard';
}
