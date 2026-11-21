import OpenAI from 'openai';
import { classify, describe, EFFORT_DROPPED_NOTICE, isEffortRejection, type ProviderFailure } from './errors';
import { mergeWithRecommended, type ListedModel } from './models.config';
import { filterChatModels } from './openai-filter';
import {
  LLMError,
  type ChatRequest,
  type Effort,
  type FetchLike,
  type LLMProvider,
  type ModelInfo,
  type StreamEvent,
} from './types';

function client(apiKey: string, fetchImpl?: FetchLike): OpenAI {
  return new OpenAI({
    apiKey,
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

/** 串流途中回報的失敗（HTTP 已是 200）：依代碼歸類，沒有對應時當成一般錯誤。 */
function streamFailure(kind: string | null | undefined, detail: string | null | undefined): StreamEvent {
  const text = `${kind ?? ''}`.toLowerCase();
  const failure: ProviderFailure = { kind: kind ?? undefined, detail: detail ?? undefined };
  const status =
    /rate_limit/.test(text) ? 429 : /insufficient_quota/.test(text) ? 402 : /server_error|overloaded/.test(text) ? 500 : 400;
  const code = classify({ ...failure, status });
  return { type: 'error', code, message: describe('openai', code, failure) };
}

export function createOpenAIProvider(fetchImpl?: FetchLike): LLMProvider {
  return {
    async listModels(apiKey): Promise<ModelInfo[]> {
      try {
        const all: { id: string; created: number }[] = [];
        for await (const model of client(apiKey, fetchImpl).models.list()) {
          all.push({ id: model.id, created: model.created });
        }
        const listed: ListedModel[] = filterChatModels(all).map((model) => ({
          id: model.id,
          createdAt: model.created > 0 ? new Date(model.created * 1000).toISOString() : null,
        }));
        return mergeWithRecommended('openai', listed);
      } catch (error) {
        const failure = toFailure(error);
        const code = classify(failure);
        throw new LLMError(code, describe('openai', code, failure));
      }
    },

    async *streamChat(apiKey, req: ChatRequest, signal): AsyncIterable<StreamEvent> {
      const api = client(apiKey, fetchImpl);
      let emittedText = false;

      async function* attempt(effort: Effort | undefined): AsyncGenerator<StreamEvent> {
        const stream = await api.responses.create(
          {
            model: req.model,
            instructions: req.system,
            input: req.messages.map((message) => ({ role: message.role, content: message.content })),
            stream: true,
            // 不請 OpenAI 保存這次回覆；每次請求都自己帶完整對話。
            store: false,
            // 不送取樣參數；推理深度只有使用者選了才送。
            ...(effort ? { reasoning: { effort } } : {}),
          },
          { signal },
        );

        let thinkingAnnounced = false;
        let refused = false;
        for await (const event of stream) {
          switch (event.type) {
            case 'response.output_item.added':
              if (event.item.type === 'reasoning' && !thinkingAnnounced) {
                thinkingAnnounced = true;
                yield { type: 'status', state: 'thinking' };
              }
              break;
            case 'response.output_text.delta':
              emittedText = true;
              yield { type: 'text', delta: event.delta };
              break;
            case 'response.refusal.delta':
              refused = true;
              break;
            case 'response.completed': {
              if (refused) {
                yield { type: 'error', code: 'refusal', message: describe('openai', 'refusal') };
                return;
              }
              const usage = event.response.usage;
              yield {
                type: 'done',
                ...(usage ? { usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } } : {}),
              };
              return;
            }
            case 'response.incomplete': {
              if (event.response.incomplete_details?.reason === 'content_filter') {
                yield { type: 'error', code: 'refusal', message: describe('openai', 'refusal') };
                return;
              }
              const usage = event.response.usage;
              yield {
                type: 'done',
                truncated: true,
                ...(usage ? { usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } } : {}),
              };
              return;
            }
            case 'response.failed':
              yield streamFailure(event.response.error?.code, event.response.error?.message);
              return;
            case 'error':
              yield streamFailure(event.code, event.message);
              return;
            default:
              break;
          }
        }
        // 串流結束卻沒有收到完成事件：連線中途斷了。
        yield { type: 'error', code: 'blocked', message: describe('openai', 'blocked') };
      }

      function* fail(error: unknown): Generator<StreamEvent> {
        const failure = toFailure(error);
        const code = classify(failure);
        yield { type: 'error', code, message: describe('openai', code, failure) };
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
