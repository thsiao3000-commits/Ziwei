// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createAnthropicProvider } from '../src/lib/llm/anthropic';
import { createGroqProvider } from '../src/lib/llm/groq';
import { cannotReadImages } from '../src/lib/llm/models.config';
import { createOpenAIProvider } from '../src/lib/llm/openai';
import { filterChatModels, isChatModelId } from '../src/lib/llm/openai-filter';
import { LLMError, type ChatRequest, type FetchLike, type LLMProvider, type StreamEvent } from '../src/lib/llm/types';

/**
 * 兩家 provider 以模擬回應測試：SDK 是真的，只把 fetch 換掉。
 * 測試裡的金鑰是假字串，不是任何真實金鑰。
 */
const FAKE_KEY = 'test-key-not-real';

type Call = { url: string; method: string; headers: Headers; body: Record<string, unknown> | null };

function recorder(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    const text = request.method === 'GET' ? '' : await request.text();
    const call: Call = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
    };
    calls.push(call);
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return respond(call, calls.length - 1);
  };
  return { calls, fetchImpl };
}

function sse(events: [string, unknown][], options: { breakAfter?: number } = {}): Response {
  const encoder = new TextEncoder();
  const limit = options.breakAfter ?? events.length;
  let index = 0;
  // 一次送一個事件；模擬斷線時，先把前面的事件送完才出錯。
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = events[index];
      if (index < limit && next) {
        index += 1;
        controller.enqueue(encoder.encode(`event: ${next[0]}\ndata: ${JSON.stringify(next[1])}\n\n`));
      } else if (options.breakAfter !== undefined) {
        controller.error(new TypeError('network connection lost'));
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** 金鑰放在哪個標頭由 SDK 決定（x-api-key 或 Authorization），測試只要求它在標頭裡。 */
function keyHeader(call: Call): string | null {
  return call.headers.get('x-api-key') ?? call.headers.get('authorization');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function collect(provider: LLMProvider, req: ChatRequest, signal = new AbortController().signal) {
  const events: StreamEvent[] = [];
  for await (const event of provider.streamChat(FAKE_KEY, req, signal)) events.push(event);
  return events;
}

const text = (events: StreamEvent[]) =>
  events.map((event) => (event.type === 'text' ? event.delta : '')).join('');

const HISTORY: ChatRequest['messages'] = [
  { role: 'user', content: '幫我看整張盤的重點' },
  { role: 'assistant', content: '命宮紫微……' },
  { role: 'user', content: '那事業呢？' },
];

// ───────────────────────────── Anthropic ─────────────────────────────

const anthropicRequest: ChatRequest = {
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  system: '你是解盤助手。命盤資料：……',
  messages: HISTORY,
};

function anthropicStream(stopReason = 'end_turn', withThinking = true): [string, unknown][] {
  const events: [string, unknown][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 120, output_tokens: 1, cache_read_input_tokens: 30, cache_creation_input_tokens: 0 },
        },
      },
    ],
  ];
  let index = 0;
  if (withThinking) {
    events.push(
      ['content_block_start', { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } }],
      ['content_block_stop', { type: 'content_block_stop', index }],
    );
    index += 1;
  }
  events.push(
    ['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: '官祿宮' } }],
    ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: '廉貞天府。' } }],
    ['content_block_stop', { type: 'content_block_stop', index }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 42 } }],
    ['message_stop', { type: 'message_stop' }],
  );
  return events;
}

const anthropicError = (status: number, type: string, message: string) =>
  json(status, { type: 'error', error: { type, message } });

describe('Anthropic provider', () => {
  it('正常串流：推演中 → 文字 → 完成與用量', async () => {
    const { calls, fetchImpl } = recorder(() => sse(anthropicStream()));
    const events = await collect(createAnthropicProvider(fetchImpl), anthropicRequest);

    expect(events[0]).toEqual({ type: 'status', state: 'thinking' });
    expect(text(events)).toBe('官祿宮廉貞天府。');
    expect(events.at(-1)).toEqual({ type: 'done', usage: { inputTokens: 150, outputTokens: 42 } });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    // 金鑰只在標頭，不在網址與內文。
    expect(keyHeader(call)).toContain(FAKE_KEY);
    expect(call.url).not.toContain(FAKE_KEY);
    expect(JSON.stringify(call.body)).not.toContain(FAKE_KEY);
    expect(call.headers.get('anthropic-version')).toBe('2026-10-21');
    expect(call.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    // 多輪對話：系統提示詞加上完整訊息紀錄。
    expect(call.body?.system).toBe(anthropicRequest.system);
    expect(call.body?.messages).toEqual(HISTORY);
    expect(call.body?.stream).toBe(true);
    // 預設不送思考、推理深度與取樣參數。
    for (const key of ['thinking', 'output_config', 'temperature', 'top_p', 'top_k']) {
      expect(call.body).not.toHaveProperty(key);
    }
  });

  it('選了推理深度才送 output_config.effort', async () => {
    const { calls, fetchImpl } = recorder(() => sse(anthropicStream()));
    await collect(createAnthropicProvider(fetchImpl), { ...anthropicRequest, effort: 'low' });
    expect(calls[0]?.body?.output_config).toEqual({ effort: 'low' });
  });

  it('推理深度被拒：移除參數重試一次並提示', async () => {
    const { calls, fetchImpl } = recorder((_call, index) =>
      index === 0
        ? anthropicError(400, 'invalid_request_error', 'output_config.effort: this model does not support effort')
        : sse(anthropicStream('end_turn', false)),
    );
    const events = await collect(createAnthropicProvider(fetchImpl), { ...anthropicRequest, effort: 'high' });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toHaveProperty('output_config');
    expect(calls[1]?.body).not.toHaveProperty('output_config');
    expect(events[0]?.type).toBe('notice');
    expect(text(events)).toBe('官祿宮廉貞天府。');
    expect(events.at(-1)?.type).toBe('done');
  });

  it('與推理深度無關的 400 不重試', async () => {
    const { calls, fetchImpl } = recorder(() => anthropicError(400, 'invalid_request_error', 'messages: something else is wrong'));
    const events = await collect(createAnthropicProvider(fetchImpl), { ...anthropicRequest, effort: 'high' });
    expect(calls).toHaveLength(1);
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'unknown' })]);
    expect((events[0] as { message: string }).message).toContain('something else is wrong');
  });

  it('到達長度上限：標記 truncated，已收到的文字保留', async () => {
    const { fetchImpl } = recorder(() => sse(anthropicStream('max_tokens')));
    const events = await collect(createAnthropicProvider(fetchImpl), anthropicRequest);
    expect(text(events)).toBe('官祿宮廉貞天府。');
    expect(events.at(-1)).toMatchObject({ type: 'done', truncated: true });
  });

  it('模型拒答（HTTP 200、stop_reason: refusal）', async () => {
    const { fetchImpl } = recorder(() => sse(anthropicStream('refusal', false)));
    const events = await collect(createAnthropicProvider(fetchImpl), anthropicRequest);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'refusal' });
  });

  it('串流中途中斷：保留已收到的文字，最後回報連線問題', async () => {
    const { fetchImpl } = recorder(() => sse(anthropicStream('end_turn', false), { breakAfter: 3 }));
    const events = await collect(createAnthropicProvider(fetchImpl), anthropicRequest);
    expect(text(events)).toBe('官祿宮');
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'blocked' });
  });

  it.each([
    [401, 'authentication_error', 'invalid x-api-key', 'invalid_key'],
    [403, 'permission_error', 'not allowed', 'no_access'],
    [404, 'not_found_error', 'model: nope', 'model_not_found'],
    [400, 'invalid_request_error', 'prompt is too long: 1200000 tokens > 1000000 maximum', 'context_too_long'],
    [400, 'invalid_request_error', 'Your credit balance is too low to access the API', 'quota'],
  ] as const)('HTTP %i %s → %s', async (status, type, message, code) => {
    const { fetchImpl } = recorder(() => anthropicError(status, type, message));
    const events = await collect(createAnthropicProvider(fetchImpl), anthropicRequest);
    expect(events).toEqual([expect.objectContaining({ type: 'error', code })]);
  });

  it.each([
    [429, 'rate_limit_error', 'rate_limited'],
    [529, 'overloaded_error', 'overloaded'],
  ] as const)('HTTP %i %s → %s（SDK 重試一次後仍失敗）', async (status, type, code) => {
    const { calls, fetchImpl } = recorder(() => anthropicError(status, type, 'try later'));
    const events = await collect(createAnthropicProvider(fetchImpl), anthropicRequest);
    expect(events).toEqual([expect.objectContaining({ type: 'error', code })]);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('請求沒有送達（斷線或被 CORS 擋下）→ blocked，訊息同時說明兩種可能', async () => {
    const { fetchImpl } = recorder(() => {
      throw new TypeError('Failed to fetch');
    });
    const events = await collect(createAnthropicProvider(fetchImpl), anthropicRequest);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', code: 'blocked' });
    const message = (events[0] as { message: string }).message;
    expect(message).toContain('網路');
    expect(message).toContain('瀏覽器直連');
    expect(message).toContain('另一家供應商');
  });

  it('使用者按停止：不回報錯誤', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetchImpl } = recorder(() => sse(anthropicStream()));
    const events = await collect(createAnthropicProvider(fetchImpl), anthropicRequest, controller.signal);
    expect(events.filter((event) => event.type === 'error')).toEqual([]);
  });

  it('模型列表：只要 active，推薦在前，其餘新到舊，推理深度取自 capabilities', async () => {
    const model = (id: string, created: string, efforts: string[] | null) => ({
      type: 'model',
      id,
      display_name: id.toUpperCase(),
      created_at: created,
      lifecycle: 'active',
      line: id.split('-')[1],
      max_input_tokens: 1_000_000,
      max_tokens: 128_000,
      capabilities:
        efforts === null
          ? null
          : {
              effort: {
                supported: efforts.length > 0,
                ...Object.fromEntries(['low', 'medium', 'high', 'xhigh', 'max'].map((level) => [level, { supported: efforts.includes(level) }])),
              },
            },
    });
    const { calls, fetchImpl } = recorder(() =>
      json(200, {
        data: [
          model('claude-future-9', '2027-01-01T00:00:00Z', ['low', 'medium', 'high', 'max']),
          model('claude-haiku-5-5', '2026-10-01T00:00:00Z', ['low', 'medium', 'high']),
          model('claude-old-1', '2024-01-01T00:00:00Z', []),
          model('claude-sonnet-5-5', '2026-09-01T00:00:00Z', ['low', 'medium', 'high', 'xhigh']),
        ],
        has_more: false,
        first_id: 'claude-future-9',
        last_id: 'claude-sonnet-5-5',
      }),
    );
    const models = await createAnthropicProvider(fetchImpl).listModels(FAKE_KEY);

    const url = new URL(calls[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://api.anthropic.com/v1/models');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(decodeURIComponent(url.search)).toContain('active');
    expect(keyHeader(calls[0]!)).toContain(FAKE_KEY);

    expect(models.map((m) => m.id)).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-future-9', 'claude-old-1']);
    expect(models[0]).toMatchObject({ recommended: true, tier: '$$', efforts: ['low', 'medium', 'high'] });
    expect(models[2]).toMatchObject({ recommended: false, tier: null, displayName: 'CLAUDE-FUTURE-9' });
    expect(models[3]?.efforts).toEqual([]);
  });

  it('模型列表失敗時丟出帶代碼的錯誤', async () => {
    const { fetchImpl } = recorder(() => anthropicError(401, 'authentication_error', 'invalid x-api-key'));
    await expect(createAnthropicProvider(fetchImpl).listModels(FAKE_KEY)).rejects.toMatchObject({
      name: 'LLMError',
      code: 'invalid_key',
    });
    await expect(createAnthropicProvider(fetchImpl).listModels(FAKE_KEY)).rejects.toBeInstanceOf(LLMError);
  });
});

// ────────────────────────────── OpenAI ──────────────────────────────

const openaiRequest: ChatRequest = {
  provider: 'openai',
  model: 'gpt-6.2-sol',
  system: '你是解盤助手。命盤資料：……',
  messages: HISTORY,
};

const response = (extra: Record<string, unknown> = {}) => ({
  id: 'resp_1',
  object: 'response',
  model: 'gpt-6.2-sol',
  status: 'completed',
  output: [],
  usage: { input_tokens: 200, output_tokens: 55, total_tokens: 255 },
  ...extra,
});

function openaiStream(last: [string, unknown], withReasoning = true): [string, unknown][] {
  const events: [string, unknown][] = [['response.created', { type: 'response.created', response: response({ status: 'in_progress' }) }]];
  if (withReasoning) {
    events.push([
      'response.output_item.added',
      { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_1', summary: [] } },
    ]);
  }
  events.push(
    ['response.output_text.delta', { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 1, content_index: 0, delta: '官祿宮' }],
    ['response.output_text.delta', { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 1, content_index: 0, delta: '廉貞天府。' }],
    last,
  );
  return events;
}

const completed: [string, unknown] = ['response.completed', { type: 'response.completed', response: response() }];

const openaiError = (status: number, code: string | null, message: string, param: string | null = null) =>
  json(status, { error: { message, type: 'invalid_request_error', param, code } });

describe('OpenAI provider', () => {
  it('正常串流：推演中 → 文字 → 完成與用量', async () => {
    const { calls, fetchImpl } = recorder(() => sse(openaiStream(completed)));
    const events = await collect(createOpenAIProvider(fetchImpl), openaiRequest);

    expect(events[0]).toEqual({ type: 'status', state: 'thinking' });
    expect(text(events)).toBe('官祿宮廉貞天府。');
    expect(events.at(-1)).toEqual({ type: 'done', usage: { inputTokens: 200, outputTokens: 55 } });

    const call = calls[0]!;
    expect(call.url).toBe('https://api.openai.com/v1/responses');
    expect(call.headers.get('authorization')).toBe(`Bearer ${FAKE_KEY}`);
    expect(JSON.stringify(call.body)).not.toContain(FAKE_KEY);
    expect(call.body?.instructions).toBe(openaiRequest.system);
    expect(call.body?.input).toEqual(HISTORY);
    expect(call.body?.stream).toBe(true);
    expect(call.body?.store).toBe(false);
    for (const key of ['reasoning', 'temperature', 'top_p']) {
      expect(call.body).not.toHaveProperty(key);
    }
  });

  it('選了推理深度才送 reasoning.effort', async () => {
    const { calls, fetchImpl } = recorder(() => sse(openaiStream(completed)));
    await collect(createOpenAIProvider(fetchImpl), { ...openaiRequest, effort: 'medium' });
    expect(calls[0]?.body?.reasoning).toEqual({ effort: 'medium' });
  });

  it('推理深度被拒：移除參數重試一次並提示', async () => {
    const { calls, fetchImpl } = recorder((_call, index) =>
      index === 0
        ? openaiError(400, 'unsupported_value', "Unsupported value: 'low' is not supported with this model.", 'reasoning.effort')
        : sse(openaiStream(completed, false)),
    );
    const events = await collect(createOpenAIProvider(fetchImpl), { ...openaiRequest, effort: 'low' });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).not.toHaveProperty('reasoning');
    expect(events[0]?.type).toBe('notice');
    expect(text(events)).toBe('官祿宮廉貞天府。');
  });

  it('到達長度上限：標記 truncated', async () => {
    const incomplete: [string, unknown] = [
      'response.incomplete',
      { type: 'response.incomplete', response: response({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }) },
    ];
    const { fetchImpl } = recorder(() => sse(openaiStream(incomplete)));
    const events = await collect(createOpenAIProvider(fetchImpl), openaiRequest);
    expect(text(events)).toBe('官祿宮廉貞天府。');
    expect(events.at(-1)).toMatchObject({ type: 'done', truncated: true });
  });

  it('內容被過濾 → refusal', async () => {
    const filtered: [string, unknown] = [
      'response.incomplete',
      { type: 'response.incomplete', response: response({ status: 'incomplete', incomplete_details: { reason: 'content_filter' } }) },
    ];
    const { fetchImpl } = recorder(() => sse(openaiStream(filtered, false)));
    const events = await collect(createOpenAIProvider(fetchImpl), openaiRequest);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'refusal' });
  });

  it('串流途中回報失敗', async () => {
    const failed: [string, unknown] = [
      'response.failed',
      { type: 'response.failed', response: response({ status: 'failed', error: { code: 'server_error', message: 'boom' } }) },
    ];
    const { fetchImpl } = recorder(() => sse(openaiStream(failed, false)));
    const events = await collect(createOpenAIProvider(fetchImpl), openaiRequest);
    expect(text(events)).toBe('官祿宮廉貞天府。');
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'overloaded' });
  });

  it('串流中途中斷：保留已收到的文字，最後回報連線問題', async () => {
    const { fetchImpl } = recorder(() => sse(openaiStream(completed, false), { breakAfter: 2 }));
    const events = await collect(createOpenAIProvider(fetchImpl), openaiRequest);
    expect(text(events)).toBe('官祿宮');
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'blocked' });
  });

  it.each([
    [401, 'invalid_api_key', 'Incorrect API key provided', 'invalid_key'],
    [403, null, 'You do not have access to this model', 'no_access'],
    [404, 'model_not_found', 'The model does not exist', 'model_not_found'],
    [400, 'context_length_exceeded', "This model's maximum context length is exceeded", 'context_too_long'],
  ] as const)('HTTP %i %s → %s', async (status, code, message, expected) => {
    const { fetchImpl } = recorder(() => openaiError(status, code, message));
    const events = await collect(createOpenAIProvider(fetchImpl), openaiRequest);
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: expected })]);
  });

  it.each([
    [429, 'rate_limit_exceeded', 'rate_limited'],
    [429, 'insufficient_quota', 'quota'],
    [503, null, 'overloaded'],
  ] as const)('HTTP %i %s → %s（SDK 重試一次後仍失敗）', async (status, code, expected) => {
    const { fetchImpl } = recorder(() => openaiError(status, code, 'try later'));
    const events = await collect(createOpenAIProvider(fetchImpl), openaiRequest);
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: expected })]);
  });

  it('請求沒有送達 → blocked', async () => {
    const { fetchImpl } = recorder(() => {
      throw new TypeError('Failed to fetch');
    });
    const events = await collect(createOpenAIProvider(fetchImpl), openaiRequest);
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'blocked' })]);
  });

  it('使用者按停止：不回報錯誤', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetchImpl } = recorder(() => sse(openaiStream(completed)));
    const events = await collect(createOpenAIProvider(fetchImpl), openaiRequest, controller.signal);
    expect(events.filter((event) => event.type === 'error')).toEqual([]);
  });

  it('模型列表：過濾掉非文字模型，推薦在前，其餘新到舊', async () => {
    const ids: [string, number][] = [
      ['gpt-6.2-sol', 1_790_000_000],
      ['gpt-image-2', 1_780_000_000],
      ['text-embedding-4-large', 1_760_000_000],
      ['gpt-7-preview', 1_800_000_000],
      ['gpt-6-luna', 1_770_000_000],
      ['gpt-realtime-2', 1_775_000_000],
      ['gpt-5.4', 1_740_000_000],
      ['omni-moderation-latest', 1_730_000_000],
    ];
    const { calls, fetchImpl } = recorder(() =>
      json(200, { object: 'list', data: ids.map(([id, created]) => ({ id, created, object: 'model', owned_by: 'openai' })) }),
    );
    const models = await createOpenAIProvider(fetchImpl).listModels(FAKE_KEY);
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(models.map((m) => m.id)).toEqual(['gpt-6.2-sol', 'gpt-6-luna', 'gpt-7-preview', 'gpt-5.4']);
    expect(models[0]).toMatchObject({ recommended: true, tier: '$$' });
    expect(models[2]).toMatchObject({ recommended: false, tier: null, efforts: null });
  });

  it('模型列表失敗時丟出帶代碼的錯誤', async () => {
    const { fetchImpl } = recorder(() => openaiError(401, 'invalid_api_key', 'Incorrect API key provided'));
    await expect(createOpenAIProvider(fetchImpl).listModels(FAKE_KEY)).rejects.toMatchObject({ code: 'invalid_key' });
  });
});

// ────────────────────────────── Groq ──────────────────────────────

const groqRequest: ChatRequest = {
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  system: '你是解盤助手。命盤資料：……',
  messages: HISTORY,
};

const groqChunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion.chunk',
  created: 1_790_000_000,
  model: 'openai/gpt-oss-120b',
  choices: [{ index: 0, delta, finish_reason: null }],
  ...extra,
});

/** Groq 的串流：推理走 delta.reasoning，用量放在最後一個 chunk 的 x_groq.usage。 */
function groqStream(finishReason = 'stop', withReasoning = true): [string, unknown][] {
  const chunks: unknown[] = [groqChunk({ role: 'assistant', content: '' })];
  if (withReasoning) chunks.push(groqChunk({ reasoning: '先看官祿宮。' }));
  chunks.push(groqChunk({ content: '官祿宮' }), groqChunk({ content: '廉貞天府。' }));
  chunks.push({
    ...groqChunk({}),
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    x_groq: { id: 'req_1', usage: { prompt_tokens: 210, completion_tokens: 66, total_tokens: 276 } },
  });
  return chunks.map((chunk) => ['message', chunk]);
}

describe('Groq provider', () => {
  it('正常串流：推演中 → 文字 → 完成與用量；走 Groq 的 OpenAI 相容端點', async () => {
    const { calls, fetchImpl } = recorder(() => sse(groqStream()));
    const events = await collect(createGroqProvider(fetchImpl), groqRequest);

    expect(events[0]).toEqual({ type: 'status', state: 'thinking' });
    expect(text(events)).toBe('官祿宮廉貞天府。');
    // 推理內容不可混進回覆。
    expect(text(events)).not.toContain('先看官祿宮');
    expect(events.at(-1)).toEqual({ type: 'done', usage: { inputTokens: 210, outputTokens: 66 } });

    const call = calls[0]!;
    expect(call.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(call.headers.get('authorization')).toBe(`Bearer ${FAKE_KEY}`);
    expect(JSON.stringify(call.body)).not.toContain(FAKE_KEY);
    expect(call.body?.messages).toEqual([{ role: 'system', content: groqRequest.system }, ...HISTORY]);
    expect(call.body?.stream).toBe(true);
    expect(call.body?.max_completion_tokens).toBe(4096);
    for (const key of ['reasoning_effort', 'reasoning_format', 'temperature', 'top_p', 'max_tokens']) {
      expect(call.body).not.toHaveProperty(key);
    }
  });

  it('選了推理深度才送 reasoning_effort；只有 Qwen 另外要求隱藏推理內容', async () => {
    const oss = recorder(() => sse(groqStream()));
    await collect(createGroqProvider(oss.fetchImpl), { ...groqRequest, effort: 'high' });
    expect(oss.calls[0]?.body?.reasoning_effort).toBe('high');
    expect(oss.calls[0]?.body).not.toHaveProperty('reasoning_format');

    const qwen = recorder(() => sse(groqStream()));
    await collect(createGroqProvider(qwen.fetchImpl), { ...groqRequest, model: 'qwen/qwen3.8-27b', effort: 'low' });
    expect(qwen.calls[0]?.body?.reasoning_effort).toBe('low');
    expect(qwen.calls[0]?.body?.reasoning_format).toBe('hidden');
  });

  it('推理深度被拒：移除參數重試一次並提示', async () => {
    const { calls, fetchImpl } = recorder((_call, index) =>
      index === 0 ? openaiError(400, 'invalid_request_error', '`reasoning_effort` is not supported with this model', 'reasoning_effort') : sse(groqStream()),
    );
    const events = await collect(createGroqProvider(fetchImpl), { ...groqRequest, effort: 'high' });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).not.toHaveProperty('reasoning_effort');
    expect(events[0]?.type).toBe('notice');
    expect(text(events)).toBe('官祿宮廉貞天府。');
  });

  it('到達長度上限：標記 truncated', async () => {
    const { fetchImpl } = recorder(() => sse(groqStream('length')));
    const events = await collect(createGroqProvider(fetchImpl), groqRequest);
    expect(events.at(-1)).toEqual({ type: 'done', truncated: true, usage: { inputTokens: 210, outputTokens: 66 } });
  });

  it('超過每分鐘 token 額度（429 或 413）：說明是 Groq 的用量限制，不是對話太長', async () => {
    for (const status of [429, 413]) {
      const { fetchImpl } = recorder(() => openaiError(status, 'rate_limit_exceeded', 'Request too large for model on tokens per minute (TPM): Limit 8000, Requested 9500'));
      const events = await collect(createGroqProvider(fetchImpl), groqRequest);
      const last = events.at(-1);
      expect(last?.type).toBe('error');
      if (last?.type !== 'error') continue;
      expect(last.message).toContain('每分鐘');
      expect(last.message).toContain('免費方案');
      expect(last.message).not.toContain('請開新對話');
    }
  });

  it('串流途中回報失敗（x_groq.error）', async () => {
    const { fetchImpl } = recorder(() =>
      sse([['message', groqChunk({ content: '官祿宮' })], ['message', { ...groqChunk({}), x_groq: { error: 'over_capacity' } }]]),
    );
    const events = await collect(createGroqProvider(fetchImpl), groqRequest);
    expect(text(events)).toBe('官祿宮');
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'overloaded' });
  });

  it('串流中途中斷：保留已收到的文字，最後回報連線問題', async () => {
    const { fetchImpl } = recorder(() => sse(groqStream(), { breakAfter: 3 }));
    const events = await collect(createGroqProvider(fetchImpl), groqRequest);
    expect(text(events)).toBe('官祿宮');
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'blocked' });
  });

  it('請求沒有送達 → blocked', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    const events = await collect(createGroqProvider(fetchImpl), groqRequest);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'blocked' });
  });

  it('使用者按停止：不回報錯誤', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetchImpl } = recorder(() => sse(groqStream()));
    const events = await collect(createGroqProvider(fetchImpl), groqRequest, controller.signal);
    expect(events.filter((event) => event.type === 'error')).toEqual([]);
  });

  it('模型列表：過濾語音與審查模型、停用的模型，推薦在前', async () => {
    const data = [
      { id: 'whisper-large-v3', created: 1_700_000_000, active: true },
      { id: 'qwen/qwen3.8-27b', created: 1_790_000_000, active: true },
      { id: 'meta-llama/llama-guard-4-12b', created: 1_760_000_000, active: true },
      { id: 'llama-3.3-70b-versatile', created: 1_750_000_000, active: true },
      { id: 'old-model', created: 1_740_000_000, active: false },
      { id: 'openai/gpt-oss-120b', created: 1_770_000_000, active: true },
    ].map((model) => ({ ...model, object: 'model', owned_by: 'x' }));
    const { calls, fetchImpl } = recorder(() => json(200, { object: 'list', data }));
    const models = await createGroqProvider(fetchImpl).listModels(FAKE_KEY);
    expect(calls[0]?.url).toBe('https://api.groq.com/openai/v1/models');
    expect(models.map((m) => m.id)).toEqual(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'llama-3.3-70b-versatile']);
    expect(models[0]).toMatchObject({ recommended: true, tier: '$', vision: false });
  });

  it('模型列表失敗時丟出帶代碼的錯誤', async () => {
    const { fetchImpl } = recorder(() => openaiError(401, 'invalid_api_key', 'Invalid API Key'));
    await expect(createGroqProvider(fetchImpl).listModels(FAKE_KEY)).rejects.toMatchObject({ code: 'invalid_key' });
  });

  it('讀圖：圖片以 data URL 送到 chat completions；GPT-OSS 標示為不能讀圖', async () => {
    const { calls, fetchImpl } = recorder(() =>
      json(200, {
        id: 'chatcmpl-2',
        object: 'chat.completion',
        created: 1_790_000_000,
        model: 'qwen/qwen3.8-27b',
        choices: [{ index: 0, message: { role: 'assistant', content: '{"year":2000}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 2100, completion_tokens: 20, total_tokens: 2120 },
      }),
    );
    const result = await createGroqProvider(fetchImpl).readImage(
      FAKE_KEY,
      { model: 'qwen/qwen3.8-27b', system: '系統', prompt: '讀出生資料', image: { mediaType: 'image/jpeg', base64: 'AAAA' } },
      new AbortController().signal,
    );
    expect(result).toEqual({ text: '{"year":2000}', usage: { inputTokens: 2100, outputTokens: 20 } });
    const content = (calls[0]?.body?.messages as { content: unknown }[])[1]?.content;
    expect(content).toEqual([
      { type: 'text', text: '讀出生資料' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ]);
    expect(cannotReadImages('groq', 'openai/gpt-oss-120b')).toBe(true);
    expect(cannotReadImages('groq', 'qwen/qwen3.8-27b')).toBe(false);
    expect(cannotReadImages('openai', 'gpt-6.2-sol')).toBe(false);
  });
});

describe('OpenAI 模型過濾', () => {
  it.each([
    ['gpt-6.2-sol', true],
    ['gpt-6.2-astra', true],
    ['gpt-6.1-terra', true],
    ['gpt-6-luna', true],
    ['gpt-5.4-mini', true],
    ['GPT-6.2-Sol', true],
    ['gpt-image-2', false],
    ['gpt-audio-mini', false],
    ['gpt-realtime-2', false],
    ['gpt-6-transcribe', false],
    ['gpt-6-mini-tts', false],
    ['gpt-5-search-preview', false],
    ['gpt-5-codex', false],
    ['text-embedding-4-large', false],
    ['omni-moderation-latest', false],
    ['whisper-1', false],
    ['dall-e-3', false],
    ['o4-mini', false],
  ])('%s → %s', (id, expected) => {
    expect(isChatModelId(id)).toBe(expected);
  });

  it('保留原本的物件', () => {
    const models = [{ id: 'gpt-6-luna', created: 1 }, { id: 'gpt-image-2', created: 2 }];
    expect(filterChatModels(models)).toEqual([{ id: 'gpt-6-luna', created: 1 }]);
  });
});
