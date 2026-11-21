import { useId, useState } from 'react';
import { recommendedModels } from '../../lib/llm/models.config';
import { PROVIDER_IDS, PROVIDER_NAMES, type ModelInfo, type ProviderId } from '../../lib/llm/types';
import { Choice } from './Choice';
import { getKey } from './keys';
import { verifyKey } from './ProviderSection';
import { effectiveModel, useModelLists, useSettings, type EffortSetting, type Verbosity } from './store';
import { buttonClass, fieldClass, legendClass } from './ui';

function optionLabel(model: ModelInfo): string {
  const parts = [model.displayName];
  if (model.recommended) parts.push('（推薦）');
  if (model.tier) parts.push(` ${model.tier}`);
  if (model.note) parts.push(`　${model.note}`);
  return parts.join('');
}

function ProviderModel({ provider }: { provider: ProviderId }) {
  const id = useId();
  const selected = useSettings((state) => state.model[provider]);
  const custom = useSettings((state) => state.customModel[provider]);
  const setModel = useSettings((state) => state.setModel);
  const setCustomModel = useSettings((state) => state.setCustomModel);
  const live = useModelLists((state) => state.lists[provider]);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  // 來源：動態列表 → 推薦清單後備 → 使用者自訂 ID。
  const models = live ?? recommendedModels(provider);
  const known = models.some((model) => model.id === selected);

  async function refresh() {
    setRefreshing(true);
    setMessage('');
    const status = await verifyKey(provider);
    setRefreshing(false);
    if (status.state === 'verified') setMessage(`已更新，可用模型 ${status.modelCount} 個。`);
    else if (status.state === 'failed') setMessage(`${status.message}目前顯示的是內建的推薦清單。`);
  }

  return (
    <div className="border-t border-line-soft py-5">
      <h3 className="text-[1.125rem]">{PROVIDER_NAMES[provider]}</h3>
      <div className="mt-2 grid max-w-[32rem] gap-3">
        <div>
          <label htmlFor={`${id}-model`} className="text-ink-muted">
            模型
          </label>
          <select
            id={`${id}-model`}
            className={`${fieldClass} mt-1`}
            value={selected}
            disabled={custom.trim() !== ''}
            onChange={(event) => setModel(provider, event.target.value)}
          >
            {!known && <option value={selected}>{selected}（不在目前的列表中）</option>}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {optionLabel(model)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-ink-muted">
            {live ? '列表來自你的金鑰可用的模型。' : '目前是內建的推薦清單。測試連線後會換成你的金鑰可用的模型。'}
            $ 越多越貴，實際價格以供應商為準。
          </p>
        </div>

        <div>
          <label htmlFor={`${id}-custom`} className="text-ink-muted">
            自訂模型 ID <span className="text-sm">選填</span>
          </label>
          <input
            id={`${id}-custom`}
            className={`${fieldClass} mt-1`}
            value={custom}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="列表沒有的新模型，直接填 ID"
            onChange={(event) => setCustomModel(provider, event.target.value)}
          />
          {custom.trim() !== '' && <p className="mt-1 text-sm">有填自訂 ID 時，提問會用「{custom.trim()}」，不用上面的選單。</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={buttonClass} onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? '更新中' : '重新整理模型列表'}
          </button>
          <p aria-live="polite" className="text-sm text-ink-muted">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

const EFFORTS: readonly { value: EffortSetting; label: string }[] = [
  { value: 'default', label: '預設' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const VERBOSITIES: readonly { value: Verbosity; label: string }[] = [
  { value: 'brief', label: '精簡' },
  { value: 'standard', label: '標準' },
  { value: 'detailed', label: '詳盡' },
];

export function ModelSection({ configured }: { configured: readonly ProviderId[] }) {
  const id = useId();
  const settings = useSettings();
  const active = settings.defaultProvider && configured.includes(settings.defaultProvider) ? settings.defaultProvider : (configured[0] ?? null);

  if (configured.length === 0) {
    return <p className="mt-3 max-w-[34em]">先在上面設定至少一把金鑰，才能選擇模型。沒有金鑰時，排盤功能仍可完整使用。</p>;
  }

  return (
    <div className="mt-3 grid gap-6">
      <Choice
        name={`${id}-provider`}
        legend="預設供應商"
        hint="解讀時預設使用的供應商。只列出已設定金鑰的。"
        value={active ?? configured[0]!}
        options={configured.map((provider) => ({ value: provider, label: PROVIDER_NAMES[provider] }))}
        onChange={(provider) => settings.update({ defaultProvider: provider })}
      />

      <div>
        <p className={legendClass}>預設模型</p>
        {configured.map((provider) => (
          <ProviderModel key={provider} provider={provider} />
        ))}
        {active && (
          <p className="border-t border-line-soft pt-3 text-sm text-ink-muted">
            目前提問會用：{PROVIDER_NAMES[active]} 的「{effectiveModel(settings, active)}」。
          </p>
        )}
      </div>

      <Choice
        name={`${id}-effort`}
        legend="推理深度"
        hint="越高想得越久、花費越多。「預設」不送這個參數，由模型自己決定。模型不接受時會自動改回預設。"
        value={settings.effort}
        options={EFFORTS}
        onChange={(effort) => settings.update({ effort })}
      />

      <Choice
        name={`${id}-verbosity`}
        legend="回覆詳細度"
        hint="只影響給模型的指示，不影響費用參數。"
        value={settings.verbosity}
        options={VERBOSITIES}
        onChange={(verbosity) => settings.update({ verbosity })}
      />

      <div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-[0.45em] size-4 accent-[var(--accent)]"
            checked={settings.includeBirthDate}
            onChange={(event) => settings.update({ includeBirthDate: event.target.checked })}
          />
          <span>
            <span className={legendClass}>提問時附上出生年月日</span>
            <span className="block max-w-[34em] text-sm text-ink-muted">
              關閉時只把命盤內容（宮位、星曜、四化、運限）送給 AI 供應商，不送稱呼與出生年月日。
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

/** 目前有金鑰的供應商。 */
export function configuredProviders(): ProviderId[] {
  return PROVIDER_IDS.filter((provider) => getKey(provider) !== null);
}
