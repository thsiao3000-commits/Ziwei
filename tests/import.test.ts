// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeChart } from '../src/features/chart/engine';
import { DEFAULT_CHART_SETTINGS } from '../src/features/chart/types';
import { compareWithImage, IMPORT_PROMPT, IMPORT_SYSTEM, parseExtraction, toBirthDraft, type Extraction } from '../src/features/import/extract';
import { fitWithin, MAX_EDGE } from '../src/lib/image';
import { createAnthropicProvider } from '../src/lib/llm/anthropic';
import { createOpenAIProvider } from '../src/lib/llm/openai';
import type { FetchLike, ImageRequest } from '../src/lib/llm/types';

// 虛構的測試資料；金鑰是假字串。
const FAKE_KEY = 'test-key-not-real';
const full = {
  found: true,
  name: '小明',
  gender: 'female',
  solar: { year: 2000, month: 8, day: 16 },
  lunar: { year: 2000, month: 7, day: 17, isLeapMonth: false },
  clock: null,
  timeBranch: '寅',
  lateZi: null,
  soulBranch: '午',
  soulMajorStars: ['紫微'],
  fiveElementsClass: '木三局',
  notes: null,
};
const extraction = (patch: Record<string, unknown> = {}): Extraction => parseExtraction(JSON.stringify({ ...full, ...patch }))!;

describe('截圖匯入：提示詞', () => {
  it('只要求抄圖上的文字，不要排盤或推算', () => {
    expect(IMPORT_SYSTEM).toContain('不要推算、不要排盤、不要猜測');
    expect(IMPORT_SYSTEM).toContain('只輸出一個 JSON 物件');
    expect(IMPORT_PROMPT).toContain('只抄圖上寫的，不要自己換算國曆與農曆');
    for (const field of ['"solar"', '"lunar"', '"timeBranch"', '"lateZi"', '"soulBranch"', '"soulMajorStars"', '"fiveElementsClass"']) {
      expect(IMPORT_PROMPT).toContain(field);
    }
  });
});

describe('截圖匯入：解析 AI 的回覆', () => {
  it('讀出完整的 JSON', () => {
    expect(extraction()).toEqual({ ...full, clock: null });
  });

  it('JSON 前後有說明文字或程式碼框也讀得出來', () => {
    const reply = `好的，以下是結果：\n\`\`\`json\n${JSON.stringify(full)}\n\`\`\`\n以上。`;
    expect(parseExtraction(reply)?.solar).toEqual({ year: 2000, month: 8, day: 16 });
  });

  it('不是 JSON 時回傳 null', () => {
    expect(parseExtraction('我看不出來這張圖')).toBeNull();
    expect(parseExtraction('{ broken')).toBeNull();
    expect(parseExtraction('')).toBeNull();
  });

  it('不合理的值一律當成沒讀到', () => {
    const parsed = extraction({
      gender: '女',
      solar: { year: 89, month: 8, day: 16 },
      lunar: { year: 2000, month: 13, day: 1 },
      clock: '25:00',
      timeBranch: '虎',
      soulBranch: 'x',
      soulMajorStars: ['紫微', 3, '', '天府'],
      fiveElementsClass: 123,
      lateZi: 'yes',
    });
    expect(parsed).toMatchObject({ gender: null, solar: null, lunar: null, clock: null, timeBranch: null, soulBranch: null, fiveElementsClass: null, lateZi: null });
    expect(parsed.soulMajorStars).toEqual(['紫微', '天府']);
  });

  it('found 為 false 時保留這個判斷', () => {
    expect(extraction({ found: false }).found).toBe(false);
  });

  it('過長的姓名與備註會截斷', () => {
    const parsed = extraction({ name: '名'.repeat(50), notes: '註'.repeat(500) });
    expect(parsed.name).toHaveLength(20);
    expect(parsed.notes).toHaveLength(200);
  });
});

describe('截圖匯入：帶進表單', () => {
  it('圖上同時有國曆與農曆時用國曆', () => {
    const { draft, missing } = toBirthDraft(extraction());
    expect(draft).toEqual({ name: '小明', gender: 'female', calendar: 'solar', year: '2000', month: '8', day: '16', timeIndex: 2 });
    expect(missing).toEqual([]);
  });

  it('只有農曆時用農曆，並帶入閏月', () => {
    const { draft } = toBirthDraft(extraction({ solar: null, lunar: { year: 2020, month: 4, day: 15, isLeapMonth: true } }));
    expect(draft).toMatchObject({ calendar: 'lunar', year: '2020', month: '4', day: '15', isLeapMonth: true });
  });

  it('有時鐘時間時以它為準', () => {
    const { draft } = toBirthDraft(extraction({ clock: '23:30', timeBranch: '子' }));
    expect(draft).toMatchObject({ clock: '23:30', timeIndex: 12 });
  });

  it('子時：圖上有標早晚才決定，沒標就請使用者選', () => {
    expect(toBirthDraft(extraction({ timeBranch: '子', lateZi: true })).draft.timeIndex).toBe(12);
    expect(toBirthDraft(extraction({ timeBranch: '子', lateZi: false })).draft.timeIndex).toBe(0);
    const unknown = toBirthDraft(extraction({ timeBranch: '子', lateZi: null }));
    expect(unknown.draft.timeIndex).toBeUndefined();
    expect(unknown.missing).toEqual(['時辰（圖上是子時，請選早子時或晚子時）']);
  });

  it('地支換成時辰索引', () => {
    expect(toBirthDraft(extraction({ timeBranch: '丑' })).draft.timeIndex).toBe(1);
    expect(toBirthDraft(extraction({ timeBranch: '亥' })).draft.timeIndex).toBe(11);
  });

  it('讀不到的欄位列出來請使用者補', () => {
    const { draft, missing } = toBirthDraft(extraction({ gender: null, solar: null, lunar: null, timeBranch: null, name: null }));
    expect(draft).toEqual({});
    expect(missing).toEqual(['性別', '出生日期', '出生時辰']);
  });
});

describe('截圖匯入：和程式排出的命盤比對', () => {
  const chart = computeChart({ name: '小明', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2 }, DEFAULT_CHART_SETTINGS);

  it('全部相符', () => {
    expect(compareWithImage(chart, extraction())).toEqual([
      { item: '命宮位置', fromImage: '午', computed: '午', matches: true },
      { item: '五行局', fromImage: '木三局', computed: '木三局', matches: true },
      { item: '命宮主星', fromImage: '紫微', computed: '紫微', matches: true },
    ]);
  });

  it('不相符的項目會標出來', () => {
    const checks = compareWithImage(chart, extraction({ soulBranch: '子', soulMajorStars: ['貪狼'], fiveElementsClass: '金四局' }));
    expect(checks.map((check) => check.matches)).toEqual([false, false, false]);
    expect(checks[2]).toMatchObject({ fromImage: '貪狼', computed: '紫微' });
  });

  it('主星的順序不影響比對；圖上沒有的項目不比', () => {
    const two = computeChart({ name: 'x', gender: 'male', calendar: 'solar', date: '1995-7-7', timeIndex: 0 }, DEFAULT_CHART_SETTINGS);
    const stars = two.palaces[two.soulPalaceIndex]!.majorStars.map((star) => star.name);
    expect(stars.length).toBe(2);
    const checks = compareWithImage(two, extraction({ soulBranch: two.soulBranch, soulMajorStars: [...stars].reverse(), fiveElementsClass: null }));
    expect(checks.map((check) => check.item)).toEqual(['命宮位置', '命宮主星']);
    expect(checks.every((check) => check.matches)).toBe(true);
    expect(compareWithImage(chart, extraction({ soulBranch: null, fiveElementsClass: null }))).toEqual([]);
  });
});

describe('圖片縮小', () => {
  it('長邊超過上限才縮，比例不變，不放大', () => {
    expect(fitWithin(3136, 1568)).toEqual({ width: MAX_EDGE, height: 784 });
    expect(fitWithin(1000, 4000)).toEqual({ width: 392, height: MAX_EDGE });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1, 100000).width).toBe(1);
  });
});

// ── 兩家供應商的讀圖請求（真的 SDK，只換掉 fetch）──

type Call = { url: string; headers: Headers; body: Record<string, unknown> };

function recorder(respond: () => Response) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    calls.push({ url: request.url, headers: request.headers, body: JSON.parse(await request.text()) as Record<string, unknown> });
    return respond();
  };
  return { calls, fetchImpl };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const request: ImageRequest = { model: 'm', system: IMPORT_SYSTEM, prompt: IMPORT_PROMPT, image: { mediaType: 'image/jpeg', base64: 'QUJD' } };
const signal = () => new AbortController().signal;

describe('讀圖請求：Anthropic', () => {
  const ok = (stopReason = 'end_turn') =>
    json(200, {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'm',
      content: [{ type: 'text', text: JSON.stringify(full) }],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 1500, output_tokens: 120 },
    });

  it('圖片以 base64 放在使用者訊息裡，不串流，金鑰只在標頭', async () => {
    const { calls, fetchImpl } = recorder(() => ok());
    const result = await createAnthropicProvider(fetchImpl).readImage(FAKE_KEY, { ...request, model: 'claude-sonnet-5-5' }, signal());
    expect(parseExtraction(result.text)?.soulBranch).toBe('午');
    expect(result.usage).toEqual({ inputTokens: 1500, outputTokens: 120 });

    const { body, url } = calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(body.stream).toBeUndefined();
    expect(body.system).toBe(IMPORT_SYSTEM);
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
          { type: 'text', text: IMPORT_PROMPT },
        ],
      },
    ]);
    for (const key of ['thinking', 'temperature', 'output_config']) expect(body).not.toHaveProperty(key);
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it('模型拒答與金鑰無效都轉成帶代碼的錯誤', async () => {
    await expect(createAnthropicProvider(recorder(() => ok('refusal')).fetchImpl).readImage(FAKE_KEY, request, signal())).rejects.toMatchObject({ code: 'refusal' });
    const bad = recorder(() => json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
    await expect(createAnthropicProvider(bad.fetchImpl).readImage(FAKE_KEY, request, signal())).rejects.toMatchObject({ name: 'LLMError', code: 'invalid_key' });
  });
});

describe('讀圖請求：OpenAI', () => {
  it('圖片以 data URL 放在輸入裡，不請 OpenAI 保存', async () => {
    const { calls, fetchImpl } = recorder(() =>
      json(200, {
        id: 'resp_1',
        object: 'response',
        status: 'completed',
        model: 'm',
        output: [{ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(full), annotations: [] }] }],
        usage: { input_tokens: 900, output_tokens: 100, total_tokens: 1000 },
      }),
    );
    const result = await createOpenAIProvider(fetchImpl).readImage(FAKE_KEY, { ...request, model: 'gpt-6.2-sol' }, signal());
    expect(parseExtraction(result.text)?.fiveElementsClass).toBe('木三局');
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 100 });

    const { body, url } = calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(body.store).toBe(false);
    expect(body.stream).toBeUndefined();
    expect(body.instructions).toBe(IMPORT_SYSTEM);
    expect(body.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_image', image_url: 'data:image/jpeg;base64,QUJD', detail: 'high' },
          { type: 'input_text', text: IMPORT_PROMPT },
        ],
      },
    ]);
  });

  it('模型不支援圖片等錯誤會帶出供應商的訊息', async () => {
    const bad = recorder(() => json(400, { error: { message: 'This model does not support image inputs.', type: 'invalid_request_error', param: null, code: null } }));
    await expect(createOpenAIProvider(bad.fetchImpl).readImage(FAKE_KEY, request, signal())).rejects.toThrow('This model does not support image inputs.');
  });
});
