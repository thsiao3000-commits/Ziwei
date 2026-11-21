/**
 * 模型定價：tokens → 美元。做法與業主的 Stock 網站相同。
 *
 * 價格表取自業主維護的 BenchAI-Support/pricing.json。它和本站在同一個網域
 *（thsiao3000-commits.github.io），所以用「同源的絕對路徑」去抓：不是第三方請求，
 * CSP 的 connect-src 'self' 就涵蓋，也不可能連到別的主機。抓不到（離線、本站搬到
 * 別的網域、開發環境）就退回下面的內嵌後備表。
 *
 * 單位：美元／每百萬 tokens；key 直接用 API 的模型 ID，查不到就不顯示費用。
 * 可選欄位：promo＝優惠價（until 之前含當天）、long_context＝輸入 tokens 超過
 * threshold 時整筆改用的費率。
 */
export type Rates = { input: number; output: number };

export type ModelPrice = Rates & {
  long_context?: Rates & { threshold: number };
  promo?: Rates & { until: string };
};

export type PricingTable = {
  schema_version: number;
  /** YYYY-MM-DD */
  updated_at: string;
  models: Record<string, ModelPrice>;
};

/** 同源的價格表與給人看的價目頁。 */
export const PRICING_PATH = '/BenchAI-Support/pricing.json';
export const PRICING_PAGE_PATH = '/BenchAI-Support/pricing.html';

/** 內嵌後備表：只留本站會呼叫的 OpenAI 與 Anthropic 模型。對照日期見 updated_at。 */
export const PRICING_FALLBACK: PricingTable = {
  schema_version: 1,
  updated_at: '2026-11-19',
  models: {
    'gpt-6.2-astra': { input: 8, output: 40, long_context: { threshold: 272_000, input: 16, output: 60 } },
    'gpt-6.2-sol': { input: 2, output: 10, long_context: { threshold: 272_000, input: 4, output: 15 } },
    'gpt-6.1-terra': { input: 1, output: 5, long_context: { threshold: 272_000, input: 2, output: 7.5 } },
    'gpt-6-luna': { input: 0.1, output: 0.5, long_context: { threshold: 272_000, input: 0.2, output: 0.75 } },
    'claude-fable-5-2': { input: 8, output: 40 },
    'claude-opus-5-5': { input: 4, output: 20 },
    'claude-sonnet-5-5': { input: 2, output: 10 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, long_context: { threshold: 100_000, input: 0.5, output: 2.5 } },
  },
};

function isRates(value: unknown): value is Rates {
  const rates = value as Rates | null;
  return typeof rates === 'object' && rates !== null && Number.isFinite(rates.input) && Number.isFinite(rates.output);
}

/** 檢查抓回來的內容是不是價格表；不是就回傳 null（改用後備表）。 */
export function parsePricing(data: unknown): PricingTable | null {
  const table = data as PricingTable | null;
  if (typeof table !== 'object' || table === null || typeof table.models !== 'object' || table.models === null) return null;
  const models: Record<string, ModelPrice> = {};
  for (const [id, price] of Object.entries(table.models)) {
    if (!isRates(price)) continue;
    const entry: ModelPrice = { input: price.input, output: price.output };
    if (isRates(price.long_context) && Number.isFinite(price.long_context.threshold)) entry.long_context = price.long_context;
    if (isRates(price.promo) && typeof price.promo.until === 'string') entry.promo = price.promo;
    models[id] = entry;
  }
  if (Object.keys(models).length === 0) return null;
  return {
    schema_version: Number(table.schema_version) || 1,
    updated_at: typeof table.updated_at === 'string' ? table.updated_at : '',
    models,
  };
}

export type LoadedPricing = { table: PricingTable; source: 'online' | 'fallback' };

let pending: Promise<LoadedPricing> | null = null;

/** 只抓一次；失敗退回內嵌表，永不 reject。 */
export function loadPricing(fetchImpl: typeof fetch = fetch): Promise<LoadedPricing> {
  pending ??= fetchImpl(PRICING_PATH, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`pricing fetch failed: ${response.status}`);
      return response.json() as Promise<unknown>;
    })
    .then((data): LoadedPricing => {
      const table = parsePricing(data);
      return table ? { table, source: 'online' } : { table: PRICING_FALLBACK, source: 'fallback' };
    })
    .catch((): LoadedPricing => ({ table: PRICING_FALLBACK, source: 'fallback' }));
  return pending;
}

/** 測試用：忘掉已經抓過的價格表。 */
export function resetPricing(): void {
  pending = null;
}

/** 生效費率：優惠價在期限內優先，輸入超過長文門檻再覆蓋；查無模型回傳 null。 */
export function effectiveRates(table: PricingTable, modelId: string, inputTokens = 0, today: Date = new Date()): Rates | null {
  const model = table.models[modelId];
  if (!model) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  // YYYY-MM-DD 可以直接用字串比較。
  const ymd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  let rates: Rates = { input: model.input, output: model.output };
  if (model.promo && ymd <= model.promo.until) rates = { input: model.promo.input, output: model.promo.output };
  if (model.long_context && inputTokens > model.long_context.threshold) {
    rates = { input: model.long_context.input, output: model.long_context.output };
  }
  return rates;
}

/** 估算一次回覆的費用（美元）；查無費率回傳 null。 */
export function estimateCostUSD(table: PricingTable, modelId: string, inputTokens: number, outputTokens: number, today: Date = new Date()): number | null {
  const rates = effectiveRates(table, modelId, inputTokens, today);
  if (!rates) return null;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

/** 「US$0.108」；不到一分錢時多顯示幾位。 */
export function formatUSD(cost: number): string {
  return `US$${cost > 0 && cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}`;
}
