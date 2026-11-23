import OpenAI from 'openai';
import { classify, describe, EFFORT_DROPPED_NOTICE, isEffortRejection, type ProviderFailure } from './errors';
import { mergeWithRecommended, type ListedModel } from './models.config';
import {
  LLMError,
  type ChatRequest,
  type Effort,
  type FetchLike,
  type ImageRequest,
  type ImageResult,
  type LLMProvider,
  type ModelInfo,
  type StreamEvent,
  type Usage,
} from './types';

/**
 * Groq：託管開源模型（GPT-OSS、Qwen 等），API 與 OpenAI 的 Chat Completions 相容。
 * 官方文件說明可以直接用 OpenAI SDK、把 base URL 換成下面這個，所以不另外裝套件。
 * 對照日期 2026-11-23：
 * - https://console.groq.com/docs/openai（相容性；logprobs、logit_bias、messages[].name 不支援）
 * - https://console.groq.com/docs/reasoning（推理參數）
 * - groq-sdk 1.6.0 的型別定義（串流的用量在最後一個 chunk 的 x_groq.usage）
 */
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * 回覆長度上限。Groq 的每分鐘 token 額度會把「提問＋這個上限」一起預先計算，
 * 免費方案只有每分鐘 8K，設太大連第一次提問都會被拒；推理用掉的 token 也算在這個上限裡。
 */
const MAX_COMPLETION_TOKENS = 4096;

function client(apiKey: string, fetchImpl?: FetchLike): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: GROQ_BASE_URL,
    // 瀏覽器直連：金鑰是使用者自己的，只存在他的瀏覽器（HANDOFF 第 7.2 節）。
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || error instanceof OpenAI.APIUserAbortError;
}

type Failure = ProviderFailure & { param?: string | null };

function toFailure(error: unknown): Failure {
  if (error instanceof OpenAI.APIError && typeof error.status === 'number') {
    return { status: error.status, kind: error.code ?? error.type ?? undefined, detail: error.message, param: error.param };
  }
  // 沒有狀態碼：請求沒有送達（斷線，或被 CORS 擋下，瀏覽器端無法分辨）。
  return {};
}

/** Groq 在 OpenAI 的格式之外多帶的欄位。 */
type GroqUsage = { prompt_tokens?: number; completion_tokens?: number };
type GroqChunk = {
  choices?: { delta?: { content?: string | null; reasoning?: string | null }; finish_reason?: string | null }[];
  usage?: GroqUsage | null;
  x_groq?: { usage?: GroqUsage | null; error?: string | null } | null;
};

function toUsage(usage: GroqUsage | null | undefined): Usage | undefined {
  if (!usage || typeof usage.prompt_tokens !== 'number' || typeof usage.completion_tokens !== 'number') return undefined;
  return { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
}

/**
 * 推理參數。Qwen 預設把推理過程用 <think> 標籤混在回覆裡，所以指定深度時一併要求隱藏；
 * GPT-OSS 的推理走獨立欄位，而且不接受 reasoning_format。
 */
function reasoningParams(model: string, effort: Effort | undefined): Record<string, unknown> {
  if (!effort) return {};
  return { reasoning_effort: effort, ...(model.startsWith('qwen/') ? { reasoning_format: 'hidden' } : {}) };
}

/** 不是文字對話用的模型（語音辨識、語音合成、內容審查）。 */
const NOT_CHAT = /whisper|tts|orpheus|guard/i;

export function createGroqProvider(fetchImpl?: FetchLike): LLMProvider {
  return {
    async listModels(apiKey): Promise<ModelInfo[]> {
      try {
        const listed: ListedModel[] = [];
        for await (const model of client(apiKey, fetchImpl).models.list()) {
          if (NOT_CHAT.test(model.id) || (model as { active?: boolean }).active === false) continue;
          listed.push({ id: model.id, createdAt: model.created > 0 ? new Date(model.created * 1000).toISOString() : null });
        }
        return mergeWithRecommended('groq', listed);
      } catch (error) {
        const failure = toFailure(error);
        const code = classify(failure);
        throw new LLMError(code, describe('groq', code, failure));
      }
    },

    async readImage(apiKey, req: ImageRequest, signal): Promise<ImageResult> {
      try {
        const response = await client(apiKey, fetchImpl).chat.completions.create(
          {
            model: req.model,
            messages: [
              { role: 'system', content: req.system },
              {
                role: 'user',
                content: [
                  { type: 'text', text: req.prompt },
                  { type: 'image_url', image_url: { url: `data:${req.image.mediaType};base64,${req.image.base64}` } },
                ],
              },
            ],
            max_completion_tokens: MAX_COMPLETION_TOKENS,
          },
          { signal },
        );
        const usage = toUsage(response.usage);
        return { text: response.choices[0]?.message.content ?? '', ...(usage ? { usage } : {}) };
      } catch (error) {
        const failure = toFailure(error);
        const code = classify(failure);
        throw new LLMError(code, describe('groq', code, failure));
      }
    },

    async *streamChat(apiKey, req: ChatRequest, signal): AsyncIterable<StreamEvent> {
      const api = client(apiKey, fetchImpl);
      let emittedText = false;

      async function* attempt(effort: Effort | undefined): AsyncGenerator<StreamEvent> {
        const stream = await api.chat.completions.create(
          {
            model: req.model,
            messages: [
              { role: 'system', content: req.system },
              ...req.messages.map((message) => ({ role: message.role, content: message.content })),
            ],
            stream: true,
            max_completion_tokens: MAX_COMPLETION_TOKENS,
            // 不送取樣參數；推理深度只有使用者選了才送。
            ...reasoningParams(req.model, effort),
          },
          { signal },
        );

        let thinkingAnnounced = false;
        let finished = false;
        let truncated = false;
        let usage: Usage | undefined;
        for await (const raw of stream) {
          const chunk = raw as unknown as GroqChunk;
          if (chunk.x_groq?.error) {
            const failure: ProviderFailure = { status: 500, kind: chunk.x_groq.error, detail: chunk.x_groq.error };
            const code = classify(failure);
            yield { type: 'error', code, message: describe('groq', code, failure) };
            return;
          }
          usage = toUsage(chunk.x_groq?.usage) ?? toUsage(chunk.usage) ?? usage;
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.delta?.reasoning && !thinkingAnnounced) {
            thinkingAnnounced = true;
            yield { type: 'status', state: 'thinking' };
          }
          if (choice.delta?.content) {
            emittedText = true;
            yield { type: 'text', delta: choice.delta.content };
          }
          if (choice.finish_reason) {
            finished = true;
            truncated = choice.finish_reason === 'length';
          }
        }
        if (!finished) {
          // 串流結束卻沒有收到結束原因：連線中途斷了。
          yield { type: 'error', code: 'blocked', message: describe('groq', 'blocked') };
          return;
        }
        yield { type: 'done', ...(truncated ? { truncated: true } : {}), ...(usage ? { usage } : {}) };
      }

      function* fail(error: unknown): Generator<StreamEvent> {
        const failure = toFailure(error);
        const code = classify(failure);
        yield { type: 'error', code, message: describe('groq', code, failure) };
      }

      try {
        yield* attempt(req.effort);
      } catch (error) {
        if (isAbort(error, signal)) return;
        const failure = toFailure(error);
        // 參數被拒時移除後重試一次，並提示使用者。
        if (req.effort && !emittedText && isEffortRejection(failure, failure.param)) {
          yield { type: 'notice', message: EFFORT_DROPPED_NOTICE };
          try {
            yield* attempt(undefined);
          } catch (retryError) {
            if (isAbort(retryError, signal)) return;
            yield* fail(retryError);
          }
          return;
        }
        yield* fail(error);
      }
    },
  };
}
