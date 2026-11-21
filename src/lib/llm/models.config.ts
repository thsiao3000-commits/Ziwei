import type { Effort, ModelInfo, ProviderId } from './types';

/**
 * 推薦模型清單。模型 ID 只寫在這個檔案，元件不直接寫 ID（CLAUDE.md）。
 * 對照官方文件的日期：2026-11-21。
 * - OpenAI：https://developers.openai.com/api/docs/models
 * - Anthropic：https://platform.claude.com/docs/en/models/overview
 *
 * 用途：下拉選單的中文定位說明與預設值；動態列表抓不到時當後備。
 * 價格只標級距，實際價格以供應商為準。
 */
const ALL_EFFORTS: readonly Effort[] = ['low', 'medium', 'high'];

type Recommended = Pick<ModelInfo, 'id' | 'displayName' | 'tier' | 'note' | 'efforts'>;

const RECOMMENDED: Record<ProviderId, readonly Recommended[]> = {
  openai: [
    { id: 'gpt-6.2-sol', displayName: 'GPT-6.2 Sol', tier: '$$', note: '日常主力，能力與費用均衡', efforts: ALL_EFFORTS },
    { id: 'gpt-6.2-astra', displayName: 'GPT-6.2 Astra', tier: '$$$', note: '旗艦，推理最強', efforts: ALL_EFFORTS },
    { id: 'gpt-6.1-terra', displayName: 'GPT-6.1 Terra', tier: '$$', note: '快速、省', efforts: ALL_EFFORTS },
    { id: 'gpt-6-luna', displayName: 'GPT-6 Luna', tier: '$', note: '最省', efforts: ALL_EFFORTS },
  ],
  anthropic: [
    { id: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', tier: '$$', note: '速度與能力均衡', efforts: ALL_EFFORTS },
    { id: 'claude-fable-5-2', displayName: 'Claude Fable 5.2', tier: '$$$', note: '推理最強', efforts: ALL_EFFORTS },
    { id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', tier: '$$$', note: '官方建議的一般預設', efforts: ALL_EFFORTS },
    { id: 'claude-haiku-5-5', displayName: 'Claude Haiku 5.5', tier: '$', note: '最快、最省', efforts: ALL_EFFORTS },
  ],
};

/** 本站預設：使用者自付費用，解盤不需要最貴的模型（HANDOFF 第 5.1 節）。 */
export const DEFAULT_MODEL: Record<ProviderId, string> = {
  openai: 'gpt-6.2-sol',
  anthropic: 'claude-sonnet-5-5',
};

export function recommendedModels(provider: ProviderId): ModelInfo[] {
  return RECOMMENDED[provider].map((model) => ({ ...model, createdAt: null, recommended: true }));
}

function findRecommended(provider: ProviderId, id: string): Recommended | undefined {
  return RECOMMENDED[provider].find((model) => model.id === id);
}

export type ListedModel = { id: string; displayName?: string; createdAt: string | null; efforts?: readonly Effort[] | null };

/**
 * 把供應商回傳的模型列表與推薦清單合併。
 * 排序：推薦清單在前（依清單順序，且只列這把金鑰真的能用的），其餘依建立時間新到舊。
 */
export function mergeWithRecommended(provider: ProviderId, listed: readonly ListedModel[]): ModelInfo[] {
  const byId = new Map(listed.map((model) => [model.id, model]));
  const recommended: ModelInfo[] = [];
  for (const rec of RECOMMENDED[provider]) {
    const live = byId.get(rec.id);
    if (!live) continue;
    recommended.push({
      ...rec,
      displayName: live.displayName ?? rec.displayName,
      createdAt: live.createdAt,
      recommended: true,
      efforts: live.efforts ?? rec.efforts,
    });
  }
  const others: ModelInfo[] = listed
    .filter((model) => !findRecommended(provider, model.id))
    .map((model) => ({
      id: model.id,
      displayName: model.displayName ?? model.id,
      createdAt: model.createdAt,
      recommended: false,
      tier: null,
      efforts: model.efforts ?? null,
    }))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.id.localeCompare(b.id));
  return [...recommended, ...others];
}

/** 這個模型已知接受的推理深度；不在任何清單裡時回傳 null（不知道）。 */
export function knownEfforts(provider: ProviderId, modelId: string): readonly Effort[] | null {
  return findRecommended(provider, modelId)?.efforts ?? null;
}

/**
 * 花費估算用的單價（美元／每百萬 token，輸入與輸出），對照官方價目的日期：2026-11-21。
 * 只用在設定頁的花費統計，而且只是估算：不含快取折扣、長提示詞加價與匯率，
 * 價格變動後也不會自動更新。模型選單上只標級距，不顯示這些數字。
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'gpt-6.2-astra': { input: 8, output: 40 },
  'gpt-6.2-sol': { input: 2, output: 10 },
  'gpt-6.1-terra': { input: 1, output: 5 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'claude-fable-5-2': { input: 8, output: 40 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

export const PRICES_AS_OF = '2026-11-21';

/** 估算花費（美元）；不認得的模型回傳 null。 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
