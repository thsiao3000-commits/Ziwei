// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  effectiveRates,
  estimateCostUSD,
  formatUSD,
  loadPricing,
  parsePricing,
  PRICING_FALLBACK,
  PRICING_PAGE_PATH,
  PRICING_PATH,
  resetPricing,
  type PricingTable,
} from '../src/lib/llm/pricing';
import { recommendedModels } from '../src/lib/llm/models.config';

const table: PricingTable = {
  schema_version: 1,
  updated_at: '2026-11-19',
  models: {
    plain: { input: 2, output: 10 },
    long: { input: 2, output: 10, long_context: { threshold: 272_000, input: 4, output: 15 } },
    promo: { input: 4, output: 20, promo: { input: 2, output: 10, until: '2026-11-30' } },
    both: { input: 4, output: 20, promo: { input: 2, output: 10, until: '2026-11-30' }, long_context: { threshold: 100_000, input: 8, output: 30 } },
  },
};

beforeEach(() => resetPricing());

describe('價格表的來源', () => {
  it('用同源路徑去抓，不是完整網址：不可能連到別的主機', () => {
    expect(PRICING_PATH).toBe('/BenchAI-Support/pricing.json');
    expect(PRICING_PAGE_PATH.startsWith('/')).toBe(true);
    for (const path of [PRICING_PATH, PRICING_PAGE_PATH]) expect(path).not.toMatch(/^https?:|^\/\//);
  });

  it('內建後備表涵蓋所有推薦模型', () => {
    for (const provider of ['openai', 'anthropic'] as const) {
      for (const model of recommendedModels(provider)) {
        expect(PRICING_FALLBACK.models[model.id], model.id).toBeDefined();
      }
    }
  });

  it('抓到線上表就用線上表，而且只抓一次', async () => {
    let calls = 0;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      expect(String(input)).toBe(PRICING_PATH);
      expect(init?.cache).toBe('no-cache');
      return new Response(JSON.stringify({ ...table, updated_at: '2027-01-01' }), { status: 200 });
    }) as typeof fetch;
    const first = await loadPricing(fetchImpl);
    const second = await loadPricing(fetchImpl);
    expect(first.source).toBe('online');
    expect(first.table.updated_at).toBe('2027-01-01');
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it.each([
    ['404', async () => new Response('Not Found', { status: 404 })],
    ['不是 JSON', async () => new Response('<html></html>', { status: 200 })],
    ['格式不對', async () => new Response('{"models":{}}', { status: 200 })],
    ['離線', async () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('抓不到（%s）就退回內建表，不會丟出錯誤', async (_name, respond) => {
    const loaded = await loadPricing(respond as unknown as typeof fetch);
    expect(loaded.source).toBe('fallback');
    expect(loaded.table).toBe(PRICING_FALLBACK);
  });

  it('只收格式正確的條目，多餘的欄位略過', () => {
    const parsed = parsePricing({
      schema_version: 1,
      updated_at: '2026-11-19',
      models: {
        good: { name: 'Good', vendor: 'x', legacy: true, input: 1, output: 5, long_context: { threshold: 10, input: 2, output: 6 } },
        'bad-number': { input: '1', output: 5 },
        'bad-promo': { input: 1, output: 5, promo: { input: 1, output: 2 } },
        empty: null,
      },
    });
    expect(Object.keys(parsed!.models)).toEqual(['good', 'bad-promo']);
    expect(parsed!.models.good).toEqual({ input: 1, output: 5, long_context: { threshold: 10, input: 2, output: 6 } });
    expect(parsed!.models['bad-promo']).toEqual({ input: 1, output: 5 });
    expect(parsePricing(null)).toBeNull();
    expect(parsePricing({ models: { x: {} } })).toBeNull();
  });
});

describe('生效費率', () => {
  const inPromo = new Date(2026, 10, 30);
  const afterPromo = new Date(2026, 11, 1);

  it('一般費率', () => {
    expect(effectiveRates(table, 'plain', 1000)).toEqual({ input: 2, output: 10 });
    expect(estimateCostUSD(table, 'plain', 1234, 321)).toBeCloseTo(0.005678, 9);
  });

  it('查無模型回傳 null', () => {
    expect(effectiveRates(table, 'nope')).toBeNull();
    expect(estimateCostUSD(table, 'nope', 1, 1)).toBeNull();
  });

  it('輸入超過長文門檻時，整筆改用長文費率（剛好等於門檻不算）', () => {
    expect(effectiveRates(table, 'long', 272_000)).toEqual({ input: 2, output: 10 });
    expect(effectiveRates(table, 'long', 272_001)).toEqual({ input: 4, output: 15 });
    expect(estimateCostUSD(table, 'long', 1_000_000, 0)).toBeCloseTo(4, 9);
  });

  it('優惠價到截止日當天都算，隔天恢復原價', () => {
    expect(effectiveRates(table, 'promo', 0, inPromo)).toEqual({ input: 2, output: 10 });
    expect(effectiveRates(table, 'promo', 0, afterPromo)).toEqual({ input: 4, output: 20 });
  });

  it('同時有優惠與長文：超過門檻以長文費率為準', () => {
    expect(effectiveRates(table, 'both', 50_000, inPromo)).toEqual({ input: 2, output: 10 });
    expect(effectiveRates(table, 'both', 200_000, inPromo)).toEqual({ input: 8, output: 30 });
  });
});

describe('金額格式', () => {
  it('一般顯示三位小數，不到一分錢顯示四位', () => {
    expect(formatUSD(0.108)).toBe('US$0.108');
    expect(formatUSD(1.5)).toBe('US$1.500');
    expect(formatUSD(0.005678)).toBe('US$0.0057');
    expect(formatUSD(0)).toBe('US$0.000');
  });
});
