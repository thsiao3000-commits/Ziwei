import Anthropic from '@anthropic-ai/sdk';
import { classify, describe, EFFORT_DROPPED_NOTICE, isEffortRejection, type ProviderFailure } from './errors';
import { mergeWithRecommended, type ListedModel } from './models.config';
import {
  LLMError,
  type ChatRequest,
  type Effort,
  type FetchLike,
  type LLMProvider,
  type ModelInfo,
  type StreamEvent,
} from './types';

/**
 * 回覆長度上限。思考的 token 也算在裡面，所以要留足空間；
 * 這個值低於目前所有模型的上限，舊模型也能用。
 */
const MAX_TOKENS = 32_000;

function client(apiKey: string, fetchImpl?: FetchLike): Anthropic {
  return new Anthropic({
    apiKey,
    // 瀏覽器直連：SDK 會自動加上 anthropic-dangerous-direct-browser-access 標頭。
    // 金鑰是使用者自己的，只存在他的瀏覽器，這正是本站的設計（HANDOFF 第 7.2 節）。
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || error instanceof Anthropic.APIUserAbortError;
}

function toFailure(error: unknown): ProviderFailure {
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    const body = error.error as { error?: { type?: string; message?: string } } | undefined;
    return { status: error.status, kind: body?.error?.type, detail: body?.error?.message ?? error.message };
  }
  // 沒有狀態碼：請求沒有送達（斷線，或被 CORS 擋下，瀏覽器端無法分辨）。
  return {};
}

function effortsOf(capabilities: unknown): readonly Effort[] | null {
  const effort = (capabilities as { effort?: Record<string, { supported?: boolean } | boolean | null> } | null)?.effort;
  if (!effort) return null;
  if (effort.supported === false) return [];
  const levels: Effort[] = ['low', 'medium', 'high'];
  return levels.filter((level) => (effort[level] as { supported?: boolean } | null)?.supported === true);
}

export function createAnthropicProvider(fetchImpl?: FetchLike): LLMProvider {
  return {
    async listModels(apiKey): Promise<ModelInfo[]> {
      try {
        const listed: ListedModel[] = [];
        for await (const model of client(apiKey, fetchImpl).models.list({ limit: 100, lifecycle: ['active'] })) {
          listed.push({
            id: model.id,
            displayName: model.display_name,
            createdAt: model.created_at,
            efforts: effortsOf(model.capabilities),
          });
        }
        return mergeWithRecommended('anthropic', listed);
      } catch (error) {
        const failure = toFailure(error);
        const code = classify(failure);
        throw new LLMError(code, describe('anthropic', code, failure));
      }
    },

    async *streamChat(apiKey, req: ChatRequest, signal): AsyncIterable<StreamEvent> {
      const api = client(apiKey, fetchImpl);
      let emittedText = false;

      async function* attempt(effort: Effort | undefined): AsyncGenerator<StreamEvent> {
        const stream = api.messages.stream(
          {
            model: req.model,
            max_tokens: MAX_TOKENS,
            system: req.system,
            messages: req.messages.map((message) => ({ role: message.role, content: message.content })),
            // 不送 thinking 與取樣參數：有些模型會拒絕（HANDOFF 第 5.3 節）。
            ...(effort ? { output_config: { effort } } : {}),
          },
          { signal },
        );

        let thinkingAnnounced = false;
        for await (const event of stream) {
          if (event.type === 'content_block_start' && event.content_block.type === 'thinking' && !thinkingAnnounced) {
            thinkingAnnounced = true;
            yield { type: 'status', state: 'thinking' };
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            emittedText = true;
            yield { type: 'text', delta: event.delta.text };
          }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') {
          yield { type: 'error', code: 'refusal', message: describe('anthropic', 'refusal') };
          return;
        }
        if (final.stop_reason === 'model_context_window_exceeded') {
          yield { type: 'error', code: 'context_too_long', message: describe('anthropic', 'context_too_long') };
          return;
        }
        const usage = final.usage;
        yield {
          type: 'done',
          usage: {
            inputTokens:
              usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
            outputTokens: usage.output_tokens,
          },
          ...(final.stop_reason === 'max_tokens' ? { truncated: true } : {}),
        };
      }

      function* fail(error: unknown): Generator<StreamEvent> {
        const failure = toFailure(error);
        const code = classify(failure);
        yield { type: 'error', code, message: describe('anthropic', code, failure) };
      }

      try {
        yield* attempt(req.effort);
      } catch (error) {
        if (isAbort(error, signal)) return;
        // 參數被拒時移除後重試一次，並提示使用者。
        if (req.effort && !emittedText && isEffortRejection(toFailure(error))) {
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
