import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_MODEL } from '../../lib/llm/models.config';
import { DEFAULT_CHART_SETTINGS, type ChartSettings } from '../chart/types';
import type { Effort, ModelInfo, ProviderId } from '../../lib/llm/types';
import { prefixed } from '../../lib/storage/keys';
import type { KeyStorageMode } from './keys';

export type Theme = 'system' | 'light' | 'dark';
export type Verbosity = 'brief' | 'standard' | 'detailed';
export type EffortSetting = 'default' | Effort;

export type KeyStatus =
  | { state: 'unset' }
  | { state: 'unverified' }
  | { state: 'verified'; modelCount: number }
  | { state: 'failed'; message: string };

/** 會存到 localStorage 的設定。不含金鑰。 */
export type SettingsData = {
  theme: Theme;
  keyStorage: KeyStorageMode;
  defaultProvider: ProviderId | null;
  model: Record<ProviderId, string>;
  /** 自訂模型 ID；有填就優先於下拉選單 */
  customModel: Record<ProviderId, string>;
  effort: EffortSetting;
  verbosity: Verbosity;
  /** 提問時附上稱呼與出生年月日；預設關閉，只送命盤內容 */
  includeBirthDate: boolean;
  keyStatus: Record<ProviderId, KeyStatus>;
  /** 新排的命盤使用的排盤設定 */
  chartDefaults: ChartSettings;
  /** 預設的解讀取向 */
  school: 'sanhe' | 'feixing';
  /** 自訂視角的指示，只存本機 */
  customPerspective: string;
};

export const DEFAULT_SETTINGS: SettingsData = {
  theme: 'system',
  keyStorage: 'local',
  defaultProvider: null,
  model: { ...DEFAULT_MODEL },
  customModel: { openai: '', anthropic: '', groq: '' },
  effort: 'default',
  verbosity: 'standard',
  includeBirthDate: false,
  keyStatus: { openai: { state: 'unset' }, anthropic: { state: 'unset' }, groq: { state: 'unset' } },
  chartDefaults: { ...DEFAULT_CHART_SETTINGS },
  school: 'sanhe',
  customPerspective: '',
};

type SettingsState = SettingsData & {
  update: (patch: Partial<SettingsData>) => void;
  setModel: (provider: ProviderId, model: string) => void;
  setCustomModel: (provider: ProviderId, model: string) => void;
  setKeyStatus: (provider: ProviderId, status: KeyStatus) => void;
  /** 每次儲存就加一，用來顯示「已儲存」 */
  savedTick: number;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      savedTick: 0,
      update: (patch) => set((state) => ({ ...patch, savedTick: state.savedTick + 1 })),
      setModel: (provider, model) =>
        set((state) => ({ model: { ...state.model, [provider]: model }, savedTick: state.savedTick + 1 })),
      setCustomModel: (provider, model) =>
        set((state) => ({ customModel: { ...state.customModel, [provider]: model }, savedTick: state.savedTick + 1 })),
      setKeyStatus: (provider, status) => set((state) => ({ keyStatus: { ...state.keyStatus, [provider]: status } })),
    }),
    {
      name: prefixed('settings'),
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state): SettingsData => pickSettings(state),
      // 以供應商為鍵的設定要逐一補上預設值：舊版存下來的資料沒有後來才加的供應商（例如 Groq）。
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsData>;
        return {
          ...current,
          ...saved,
          model: { ...current.model, ...saved.model },
          customModel: { ...current.customModel, ...saved.customModel },
          keyStatus: { ...current.keyStatus, ...saved.keyStatus },
        };
      },
    },
  ),
);

export function pickSettings(state: SettingsData): SettingsData {
  return {
    theme: state.theme,
    keyStorage: state.keyStorage,
    defaultProvider: state.defaultProvider,
    model: state.model,
    customModel: state.customModel,
    effort: state.effort,
    verbosity: state.verbosity,
    includeBirthDate: state.includeBirthDate,
    keyStatus: state.keyStatus,
    chartDefaults: state.chartDefaults,
    school: state.school,
    customPerspective: state.customPerspective,
  };
}

/** 實際會用來提問的模型 ID：有填自訂 ID 就用它。 */
export function effectiveModel(settings: Pick<SettingsData, 'model' | 'customModel'>, provider: ProviderId): string {
  return settings.customModel[provider].trim() || settings.model[provider];
}

/** 佈景主題：跟隨系統時不設屬性，交給 CSS 的 prefers-color-scheme。 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** 模型列表只快取在記憶體，重新整理頁面就重抓（HANDOFF 第 5.2 節）。 */
type ModelLists = {
  lists: Partial<Record<ProviderId, ModelInfo[]>>;
  setList: (provider: ProviderId, models: ModelInfo[] | undefined) => void;
};

export const useModelLists = create<ModelLists>()((set) => ({
  lists: {},
  setList: (provider, models) => set((state) => ({ lists: { ...state.lists, [provider]: models } })),
}));
