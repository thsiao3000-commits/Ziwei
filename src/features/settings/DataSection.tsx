import { useId, useRef, useState } from 'react';
import { clearSiteData } from '../../lib/storage/local';
import { PROVIDER_IDS } from '../../lib/llm/types';
import { BackupError, createBackup, parseBackup, restoreBackup } from './backup';
import { Choice } from './Choice';
import { moveKeys, type KeyStorageMode } from './keys';
import { useSettings, type Theme } from './store';
import { buttonClass, dangerButtonClass, legendClass } from './ui';

const THEMES: readonly { value: Theme; label: string }[] = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '青花（淺色）' },
  { value: 'dark', label: '夜觀（深色）' },
];

const KEY_MODES: readonly { value: KeyStorageMode; label: string }[] = [
  { value: 'local', label: '記在這台裝置' },
  { value: 'session', label: '只記到關閉分頁' },
];

export function KeyStorageChoice() {
  const id = useId();
  const keyStorage = useSettings((state) => state.keyStorage);
  const update = useSettings((state) => state.update);
  return (
    <Choice
      name={`${id}-keymode`}
      legend="記住金鑰的方式"
      hint="「只記到關閉分頁」比較安全，但每次開新分頁都要重新貼上金鑰。"
      value={keyStorage}
      options={KEY_MODES}
      onChange={(mode) => {
        moveKeys(PROVIDER_IDS, mode);
        update({ keyStorage: mode });
      }}
    />
  );
}

export function DataSection() {
  const id = useId();
  const theme = useSettings((state) => state.theme);
  const update = useSettings((state) => state.update);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function report(text: string, isError = false) {
    setMessage(text);
    setFailed(isError);
  }

  async function exportAll() {
    try {
      const backup = await createBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ziwei-backup-${backup.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      report(`已匯出 ${backup.charts.length} 張命盤與設定。匯出檔不含 API 金鑰。`);
    } catch {
      report('匯出失敗：讀不到這台裝置上的資料。請重新整理後再試。', true);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const count = await restoreBackup(parseBackup(await file.text()));
      report(`已匯入 ${count} 張命盤與設定。金鑰不在備份檔裡，需要另外貼上。`);
    } catch (error) {
      report(error instanceof BackupError ? error.message : '匯入失敗：資料無法寫入這台裝置。', true);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function clearAll() {
    await clearSiteData();
    // 記憶體裡的狀態也要丟掉，最直接的方式是重新載入。
    window.location.reload();
  }

  return (
    <div className="mt-3 grid gap-6">
      <Choice name={`${id}-theme`} legend="佈景主題" value={theme} options={THEMES} onChange={(value) => update({ theme: value })} />

      <div>
        <p className={legendClass}>備份</p>
        <p className="max-w-[34em] text-sm text-ink-muted">匯出檔包含命盤與設定，不含 API 金鑰。匯入時，同一張命盤以備份檔為準。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => void exportAll()}>
            匯出全部資料
          </button>
          <button type="button" className={buttonClass} onClick={() => fileInput.current?.click()}>
            匯入備份檔
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="選擇備份檔"
            tabIndex={-1}
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
        </div>
        <p aria-live="polite" className={`mt-2 min-h-[1.9em] ${failed ? 'border-l-2 border-danger pl-3 text-danger' : 'text-ink-muted'}`}>
          {message}
        </p>
      </div>

      <div>
        <p className={legendClass}>清除資料</p>
        <p className="max-w-[34em] text-sm text-ink-muted">
          刪除這台裝置上本站的命盤、對話、設定與金鑰，無法復原。同網域其他網站的資料不受影響。
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {confirming ? (
            <>
              <button type="button" className={dangerButtonClass} onClick={() => void clearAll()}>
                確定清除本站所有資料
              </button>
              <button type="button" className={buttonClass} onClick={() => setConfirming(false)}>
                保留資料
              </button>
            </>
          ) : (
            <button type="button" className={buttonClass} onClick={() => setConfirming(true)}>
              清除本站所有資料
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
