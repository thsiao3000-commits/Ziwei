import { computeChart } from '../chart/engine';
import { getDB } from '../../lib/storage/db';
import type { SavedChart } from '../chart/types';
import { usePreferences, type Density } from './preferences';
import { DEFAULT_SETTINGS, pickSettings, useSettings, type SettingsData } from './store';

/**
 * 匯出與匯入全部資料。匯出檔不含 API 金鑰，也不含金鑰的驗證狀態。
 */
export type Backup = {
  app: 'ziwei';
  version: 1;
  exportedAt: string;
  settings: Omit<SettingsData, 'keyStatus'>;
  preferences: { density: Density | null };
  charts: SavedChart[];
};

export async function createBackup(): Promise<Backup> {
  const { keyStatus: _keyStatus, ...settings } = pickSettings(useSettings.getState());
  void _keyStatus;
  return {
    app: 'ziwei',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    preferences: { density: usePreferences.getState().density },
    charts: await (await getDB()).getAll('charts'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSavedChart(value: unknown): value is SavedChart {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[a-z0-9]{8,32}$/.test(value.id)) return false;
  if (!isRecord(value.input) || !isRecord(value.chartSettings)) return false;
  try {
    // 能排出盤，才算是有效的命盤記錄。
    computeChart(value.input as SavedChart['input'], value.chartSettings as SavedChart['chartSettings']);
    return typeof value.input.name === 'string';
  } catch {
    return false;
  }
}

export class BackupError extends Error {}

/** 解析匯入檔。格式不對時丟出 BackupError，訊息可直接顯示。 */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('這個檔案不是有效的 JSON。請選擇從本站匯出的備份檔。');
  }
  if (!isRecord(data) || data.app !== 'ziwei' || data.version !== 1 || !Array.isArray(data.charts)) {
    throw new BackupError('這不是本站的備份檔，或版本不相容。');
  }
  const charts = data.charts.filter(isSavedChart);
  const settings = isRecord(data.settings) ? data.settings : {};
  const preferences = isRecord(data.preferences) ? data.preferences : {};
  return {
    app: 'ziwei',
    version: 1,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    settings: settings as Backup['settings'],
    preferences: { density: (preferences.density as Density | null | undefined) ?? null },
    charts,
  };
}

const THEMES = ['system', 'light', 'dark'];
const EFFORTS = ['default', 'low', 'medium', 'high'];
const VERBOSITIES = ['brief', 'standard', 'detailed'];
const DENSITY_VALUES = ['compact', 'standard', 'full'];

/** 把備份寫回本機。命盤以 id 合併，同 id 的以備份為準。回傳匯入的命盤數。 */
export async function restoreBackup(backup: Backup): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('charts', 'readwrite');
  await Promise.all([...backup.charts.map((chart) => tx.store.put(chart)), tx.done]);

  const s = backup.settings as Partial<SettingsData>;
  const current = useSettings.getState();
  useSettings.getState().update({
    theme: THEMES.includes(s.theme ?? '') ? s.theme : current.theme,
    effort: EFFORTS.includes(s.effort ?? '') ? s.effort : current.effort,
    verbosity: VERBOSITIES.includes(s.verbosity ?? '') ? s.verbosity : current.verbosity,
    includeBirthDate: typeof s.includeBirthDate === 'boolean' ? s.includeBirthDate : current.includeBirthDate,
    model: {
      openai: typeof s.model?.openai === 'string' ? s.model.openai : current.model.openai,
      anthropic: typeof s.model?.anthropic === 'string' ? s.model.anthropic : current.model.anthropic,
    },
    customModel: {
      openai: typeof s.customModel?.openai === 'string' ? s.customModel.openai : DEFAULT_SETTINGS.customModel.openai,
      anthropic:
        typeof s.customModel?.anthropic === 'string' ? s.customModel.anthropic : DEFAULT_SETTINGS.customModel.anthropic,
    },
  });

  const density = backup.preferences.density;
  if (density && DENSITY_VALUES.includes(density)) usePreferences.getState().setDensity(density);
  return backup.charts.length;
}
