import { useId, useState } from 'react';
import { getProvider } from '../../lib/llm';
import { LLMError, PROVIDER_NAMES, type ProviderId } from '../../lib/llm/types';
import { clearKey, getKey, maskKey, setKey } from './keys';
import { useModelLists, useSettings, type KeyStatus } from './store';
import { buttonClass, fieldClass } from './ui';

/** 各家官方 API 主控台的金鑰頁（2026-11-21 確認可開啟）。 */
const KEY_PAGES: Record<ProviderId, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://platform.claude.com/settings/keys',
};

const STATUS_TEXT: Record<KeyStatus['state'], string> = {
  unset: '未設定',
  unverified: '已設定，尚未驗證',
  verified: '已驗證',
  failed: '驗證失敗',
};

/** 用這把金鑰向供應商要模型列表。成功就更新列表快取與狀態。 */
export async function verifyKey(provider: ProviderId): Promise<KeyStatus> {
  const key = getKey(provider);
  if (!key) return { state: 'unset' };
  let status: KeyStatus;
  try {
    const models = await (await getProvider(provider)).listModels(key);
    useModelLists.getState().setList(provider, models);
    status = { state: 'verified', modelCount: models.length };
  } catch (error) {
    status = {
      state: 'failed',
      message: error instanceof LLMError ? error.message : `${PROVIDER_NAMES[provider]} 連線測試時發生未預期的錯誤。請稍後再試。`,
    };
  }
  useSettings.getState().setKeyStatus(provider, status);
  return status;
}

export function ProviderSection({ provider }: { provider: ProviderId }) {
  const id = useId();
  const name = PROVIDER_NAMES[provider];
  const status = useSettings((state) => state.keyStatus[provider]);
  const keyStorage = useSettings((state) => state.keyStorage);
  const defaultProvider = useSettings((state) => state.defaultProvider);
  const update = useSettings((state) => state.update);
  const setKeyStatus = useSettings((state) => state.setKeyStatus);
  const setList = useModelLists((state) => state.setList);

  // 金鑰本身不放進 React 狀態以外的地方；畫面只顯示遮罩。
  const [masked, setMasked] = useState(() => {
    const key = getKey(provider);
    return key ? maskKey(key) : '';
  });
  const [draft, setDraft] = useState('');
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');

  const hasKey = masked !== '';
  // 儲存裡沒有金鑰時（例如只記到關閉分頁、分頁已關），以實際情況為準。
  const shown: KeyStatus = hasKey ? (status.state === 'unset' ? { state: 'unverified' } : status) : { state: 'unset' };

  function save(value: string) {
    const key = value.trim();
    if (!key) return;
    if (!setKey(provider, key, keyStorage)) {
      setNotice('金鑰無法存到這台裝置。請確認瀏覽器沒有停用網站儲存空間。');
      return;
    }
    setMasked(maskKey(key));
    setDraft('');
    setVisible(false);
    setKeyStatus(provider, { state: 'unverified' });
    setList(provider, undefined);
    if (defaultProvider === null) update({ defaultProvider: provider });
    setNotice(keyStorage === 'local' ? '金鑰已存在這台裝置。' : '金鑰已記住，關閉分頁後就會清除。');
  }

  function clear() {
    clearKey(provider);
    setMasked('');
    setDraft('');
    setKeyStatus(provider, { state: 'unset' });
    setList(provider, undefined);
    if (defaultProvider === provider) {
      const other: ProviderId = provider === 'openai' ? 'anthropic' : 'openai';
      update({ defaultProvider: getKey(other) ? other : null });
    }
    setNotice('金鑰已從這台裝置清除。');
  }

  async function test() {
    setTesting(true);
    setNotice('');
    await verifyKey(provider);
    setTesting(false);
  }

  return (
    <section aria-labelledby={`${id}-title`} data-testid={`provider-${provider}`} className="border-t border-line-soft py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 id={`${id}-title`} className="text-[1.25rem]">
          {name}
        </h3>
        <p className="font-kai" data-testid={`key-status-${provider}`}>
          {STATUS_TEXT[shown.state]}
        </p>
      </div>

      {hasKey ? (
        <div className="mt-3">
          <p>
            <span className="text-ink-muted">API 金鑰</span>
            <span className="ml-3 font-mono tracking-wide" data-testid={`key-mask-${provider}`}>
              {masked}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => void test()} disabled={testing}>
              {testing ? '測試中' : '測試連線'}
            </button>
            <button type="button" className={buttonClass} onClick={clear}>
              清除金鑰
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 max-w-[32rem]">
          <label htmlFor={`${id}-key`} className="text-ink-muted">
            API 金鑰
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={`${id}-key`}
              type={visible ? 'text' : 'password'}
              className={fieldClass}
              value={draft}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="貼上金鑰後會自動儲存"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => save(draft)}
              onPaste={(event) => {
                event.preventDefault();
                save(event.clipboardData.getData('text'));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save(draft);
              }}
            />
            <button
              type="button"
              className={buttonClass}
              aria-pressed={visible}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setVisible((current) => !current)}
            >
              {visible ? '隱藏金鑰' : '顯示金鑰'}
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="mt-3 min-h-[1.9em]">
        {shown.state === 'verified' && <p>連線成功，可用模型 {shown.modelCount} 個。</p>}
        {shown.state === 'failed' && <p className="border-l-2 border-danger pl-3 text-danger">{shown.message}</p>}
        {notice && shown.state !== 'failed' && shown.state !== 'verified' && <p className="text-ink-muted">{notice}</p>}
      </div>

      <p className="mt-1 text-sm">
        <a href={KEY_PAGES[provider]} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
          到 {name} 主控台取得金鑰
        </a>
        <span className="text-ink-muted">（另開分頁）</span>
      </p>
      <p className="mt-2 max-w-[34em] text-sm text-ink-muted">
        金鑰只存在這台裝置的瀏覽器，本站沒有伺服器會收到它。提問時，你的瀏覽器會把金鑰直接送給 OpenAI 或 Anthropic。
      </p>
    </section>
  );
}
