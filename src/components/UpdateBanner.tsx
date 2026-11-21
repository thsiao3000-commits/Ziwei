import { useEffect, useRef, useState } from 'react';
import { useBusy } from '../lib/busy';
import { readItem, removeItem, writeItem } from '../lib/storage/local';
import { APP_VERSION, compareVersions, parseVersionFile } from '../lib/version';

/** 兩次檢查至少間隔 10 分鐘。 */
const INTERVAL = 10 * 60 * 1000;
const TARGET_KEY = 'update-target';

async function fetchRemoteVersion(): Promise<string | null> {
  // 只連本站，而且不走快取。
  const response = await fetch(`${import.meta.env.BASE_URL}version.json?_upd=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return parseVersionFile(await response.text());
}

/**
 * 重新載入後如果還是舊版（快取沒換掉），改用帶版本參數的網址再載一次，只試一次。
 * 回傳 true 表示頁面即將被換掉。
 */
export function retryAfterReload(): boolean {
  const target = readItem(TARGET_KEY, 'session');
  removeItem(TARGET_KEY, 'session');
  if (target && compareVersions(target, APP_VERSION) > 0) {
    window.location.replace(`${window.location.pathname}?v=${encodeURIComponent(target)}${window.location.hash}`);
    return true;
  }
  // 帶版本參數的那次載入已經完成（不論有沒有拿到新版）：把參數從網址拿掉，保持網址乾淨。
  if (window.location.search.includes('v=')) {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`);
  }
  return false;
}

/** 新版偵測提示條：線上的版本比目前載入的新時，出現在頂部列下方。 */
export function UpdateBanner() {
  const [remote, setRemote] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [updating, setUpdating] = useState(false);
  const lastCheck = useRef(0);
  const dismissed = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (Date.now() - lastCheck.current < INTERVAL) return;
      lastCheck.current = Date.now();
      try {
        const version = await fetchRemoteVersion();
        if (cancelled || !version || compareVersions(version, APP_VERSION) <= 0 || version === dismissed.current) return;
        setRemote(version);
      } catch {
        // 離線或抓不到就算了，下次再檢查。
      }
    }
    // 開頁後稍等再檢查，不搶第一次繪製；切回前景、從往返快取還原時也檢查。
    const timer = window.setTimeout(() => void check(), 3000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  if (!remote) return null;

  async function update() {
    if (!remote) return;
    if (useBusy.getState().streaming) {
      setBlocked(true);
      return;
    }
    setUpdating(true);
    writeItem(TARGET_KEY, remote, 'session');
    try {
      // 先把瀏覽器快取換成新版，重新載入才拿得到。
      await fetch(window.location.pathname, { cache: 'reload' });
    } catch {
      // 換不掉也照樣重新載入；載入後還是舊版的話，會改用帶版本參數的網址再試一次。
    }
    window.location.reload();
  }

  return (
    <div role="status" className="border-b border-line bg-surface print:hidden">
      <div className="flex w-full max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 md:px-5">
        <p className="min-w-0 flex-1 basis-[16rem]">
          {blocked
            ? 'AI 正在回覆，重新載入會中斷。請等回覆完成後再按「立即更新」。'
            : `有新版 ${remote}（目前 ${APP_VERSION}）。更新只會重新載入頁面，命盤、對話與設定不受影響。`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={updating}
            onClick={() => void update()}
            className="rounded-control bg-accent px-3 py-1 font-kai font-bold text-accent-ink disabled:opacity-60"
          >
            {updating ? '更新中' : '立即更新'}
          </button>
          <button
            type="button"
            className="rounded-control border border-line px-3 py-1 font-kai"
            onClick={() => {
              // 同一版不再提示，直到重新開頁。
              dismissed.current = remote;
              setRemote(null);
            }}
          >
            稍後再說
          </button>
        </div>
      </div>
    </div>
  );
}
