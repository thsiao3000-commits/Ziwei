import { useEffect, useState } from 'react';
import { ChartSection } from '../features/settings/ChartSection';
import { GuideSection } from '../features/settings/GuideSection';
import { DataSection, KeyStorageChoice } from '../features/settings/DataSection';
import { ModelSection, configuredProviders } from '../features/settings/ModelSection';
import { ProviderSection } from '../features/settings/ProviderSection';
import { useSettings } from '../features/settings/store';
import { UsageSection } from '../features/settings/UsageSection';
import { PROVIDER_IDS } from '../lib/llm/types';

/** 設定自動儲存；每次儲存後短暫顯示「已儲存」。 */
function SavedIndicator() {
  const tick = useSettings((state) => state.savedTick);
  // 已經過了顯示時間的那一次儲存。
  const [expired, setExpired] = useState(0);
  const visible = tick !== 0 && tick !== expired;

  useEffect(() => {
    if (tick === 0) return;
    const timer = window.setTimeout(() => setExpired(tick), 2000);
    return () => window.clearTimeout(timer);
  }, [tick]);

  return (
    <p aria-live="polite" className="font-kai text-ink-muted">
      {visible ? '已儲存' : '設定會自動儲存'}
    </p>
  );
}

export function Settings() {
  // 訂閱金鑰狀態與記住方式：它們變動時（儲存、清除、切換）重新讀一次有哪些供應商可用。
  useSettings((state) => state.keyStatus);
  useSettings((state) => state.keyStorage);
  const configured = configuredProviders();

  return (
    // 寬螢幕（xl 以上）不限制在窄欄：指南的三段並排，四個設定區分成左右兩欄。
    <div className="max-w-[46rem] xl:max-w-none">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6">
        <h1 className="text-[1.75rem] md:text-[2.25rem]">設定</h1>
        <SavedIndicator />
      </div>

      {/* 還沒有金鑰的人多半是第一次來：指南預設展開。 */}
      <div className="mt-6">
        <GuideSection defaultOpen={configured.length === 0} />
      </div>

      <div className="mt-8 grid gap-x-16 gap-y-12 xl:grid-cols-2">
        <div className="grid min-w-0 content-start gap-y-12">
          <section aria-labelledby="settings-keys">
            <h2 id="settings-keys" className="text-[1.5rem]">
              AI 供應商與金鑰
            </h2>
            <p className="mt-2 max-w-[34em]">
              解讀功能用你自己的 API 金鑰，費用由供應商直接向你收取。沒有金鑰時，排盤功能仍可完整使用。
            </p>
            <div className="mt-4">
              {PROVIDER_IDS.map((provider) => (
                <ProviderSection key={provider} provider={provider} />
              ))}
            </div>
            <div className="border-t border-line-soft pt-6">
              <KeyStorageChoice />
            </div>
          </section>

          <section aria-labelledby="settings-model">
            <h2 id="settings-model" className="text-[1.5rem]">
              模型
            </h2>
            <ModelSection configured={configured} />
          </section>

        </div>
        <div className="grid min-w-0 content-start gap-y-12">
          <section aria-labelledby="settings-chart">
            <h2 id="settings-chart" className="text-[1.5rem]">
              排盤
            </h2>
            <ChartSection />
          </section>

          <section aria-labelledby="settings-data">
            <h2 id="settings-data" className="text-[1.5rem]">
              外觀與資料
            </h2>
            <DataSection />
            <div className="mt-8">
              <UsageSection />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
