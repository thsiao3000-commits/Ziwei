import { useEffect, useRef, useState } from 'react';
import { useBusy } from '../lib/busy';
import { readItem, removeItem, writeItem } from '../lib/storage/local';
import { APP_VERSION, compareVersions, parseVersionFile } from '../lib/version';

/** 兩次檢查至少間隔 10 分鐘。 */
const INTERVAL = 10 * 60 * 1000;
const TARGET_KEY = 'update-target';
/** 這個分頁已經自動更新過哪一版（避免載不到新版時一直重載）。 */
const AUTO_KEY = 'update-auto';

/** 換成線上的最新版：先刷新瀏覽器快取，再重新載入。 */
async function reloadToVersion(version: string): Promise<void> {
  writeItem(TARGET_KEY, version, 'session');
  try {
    // 先把瀏覽器快取換成新版，重新載入才拿得到。
    await fetch(window.location.pathname, { cache: 'reload' });
  } catch {
    // 換不掉也照樣重新載入；載入後還是舊版的話，會改用帶版本參數的網址再試一次。
  }
  window.location.reload();
}

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

/**
 * 一律載入最新版，不受快取影響。
 *
 * GitHub Pages 會讓瀏覽器把 index.html 快取 10 分鐘，而且這個標頭改不了；久開的分頁也可能一直是舊的。
 * 所以每次開頁都不走快取查一次線上的版本：
 * - 使用者還沒開始操作 → 直接換成新版，不必按任何東西。
 * - 已經在操作（打字、點選，或 AI 正在回覆）→ 不打斷，改用提示條讓使用者決定。
 * 切回前景時也會再查，那時一律用提示條。
 */
export function UpdateBanner() {
  const [remote, setRemote] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [updating, setUpdating] = useState(false);
  const lastCheck = useRef(0);
  const dismissed = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 使用者開始操作之後，就不再自動重新載入。
    let interacted = false;
    const markInteracted = () => {
      interacted = true;
    };
    const INTERACTIONS = ['pointerdown', 'keydown', 'input'] as const;
    for (const type of INTERACTIONS) window.addEventListener(type, markInteracted, { once: true, capture: true });

    async function check(atStartup: boolean) {
      if (Date.now() - lastCheck.current < INTERVAL) return;
      lastCheck.current = Date.now();
      try {
        const version = await fetchRemoteVersion();
        if (cancelled || !version || compareVersions(version, APP_VERSION) <= 0 || version === dismissed.current) return;
        const canAutoUpdate =
          atStartup && !interacted && !useBusy.getState().streaming && readItem(AUTO_KEY, 'session') !== version;
        if (canAutoUpdate) {
          writeItem(AUTO_KEY, version, 'session');
          await reloadToVersion(version);
          return;
        }
        setRemote(version);
      } catch {
        // 離線或抓不到就算了，下次再檢查。
      }
    }
    // 開頁就查；切回前景、從往返快取還原時也查。
    void check(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check(false);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void check(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      cancelled = true;
      for (const type of INTERACTIONS) window.removeEventListener(type, markInteracted, { capture: true });
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
    await reloadToVersion(remote);
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
