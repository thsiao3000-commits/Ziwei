import { useCallback, useEffect, useRef, useState } from 'react';
import { computeHoroscope } from '../chart/engine';
import type { ChartData, SavedChart } from '../chart/types';
import { isChunkLoadError, isChunkReloadPending, reloadForStaleChunks } from '../../components/UpdateBanner';
import { useBusy } from '../../lib/busy';
import { getProvider, ModuleLoadError } from '../../lib/llm';
import { estimateCostUSD, loadPricing } from '../../lib/llm/pricing';
import type { ProviderId } from '../../lib/llm/types';
import { getKey } from '../settings/keys';
import { effectiveModel, useSettings } from '../settings/store';
import { buildSystemPrompt, CONTINUE_MESSAGE, type QuickPrompt } from './prompts';
import { buildAttachment, titleFrom, toChatMessages, todayString } from './request';
import { recordUsage } from '../settings/usage';
import { serializeChart, type School } from './serialize';
import { createConversation, deleteConversation, listConversations, saveConversation } from './store';
import type { AssistantMessage, Conversation, Message, UserMessage } from './types';

/** 正在產生中的回覆。 */
export type Pending = {
  /** waiting：請求已送出；thinking：模型在推理；streaming：開始收到文字 */
  phase: 'waiting' | 'thinking' | 'streaming';
  text: string;
  startedAt: number;
  provider: ProviderId;
  model: string;
};

export type SendOptions = {
  /** 開一段新對話來問，不接在目前的對話後面 */
  fresh?: boolean;
  /** 另外附上的資料（例如定盤候選） */
  extra?: { label: string; text: string };
};

export type Reading = {
  /** null：還在讀取本機的對話 */
  conversations: Conversation[] | null;
  current: Conversation | null;
  pending: Pending | null;
  /** 本機儲存失敗等、不屬於某一則回覆的錯誤 */
  problem: string;
  send: (text: string, quick?: Pick<QuickPrompt, 'palaces'>, options?: SendOptions) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  continueReply: () => Promise<void>;
  startNew: () => void;
  select: (id: string) => void;
  rename: (title: string) => Promise<void>;
  remove: () => Promise<void>;
};

type Options = {
  saved: SavedChart;
  chart: ChartData;
  selectedPalace: number | null;
  provider: ProviderId | null;
  /** 這次提問採用的解讀視角 */
  perspective: School;
  /** 盤上選中的運限要附上的資料 */
  limits?: { label: string; text: string } | undefined;
};

export function useReading({ saved, chart, selectedPalace, provider, perspective, limits }: Options): Reading {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [problem, setProblem] = useState('');
  const abort = useRef<AbortController | null>(null);
  // 串流期間以這份為準，避免拿到過期的 state。
  const live = useRef<Conversation | null>(null);

  useEffect(() => {
    let cancelled = false;
    listConversations(saved.id)
      .then((list) => {
        if (cancelled) return;
        setConversations(list);
        setCurrentId(list[0]?.id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setConversations([]);
        setProblem('讀不到這台裝置上的對話紀錄。仍然可以提問，但這次的對話可能無法保存。');
      });
    return () => {
      cancelled = true;
      abort.current?.abort();
    };
  }, [saved.id]);

  // 讓更新提示知道 AI 是否正在回覆，避免在回覆途中重新載入。
  const streaming = pending !== null;
  useEffect(() => {
    useBusy.getState().setStreaming(streaming);
    return () => useBusy.getState().setStreaming(false);
  }, [streaming]);

  const current = conversations?.find((item) => item.id === currentId) ?? null;

  const commit = useCallback(async (conversation: Conversation) => {
    live.current = conversation;
    setConversations((list) => {
      const others = (list ?? []).filter((item) => item.id !== conversation.id);
      return [conversation, ...others];
    });
    setCurrentId(conversation.id);
    try {
      await saveConversation(conversation);
    } catch {
      setProblem('這段對話無法存到這台裝置（可能是儲存空間已滿或被停用）。重新整理後會消失。');
    }
  }, []);

  /** 依目前的訊息紀錄向模型要一則回覆，結束後寫回對話。 */
  const run = useCallback(
    async (conversation: Conversation) => {
      if (!provider) return;
      const key = getKey(provider);
      const settings = useSettings.getState();
      const model = effectiveModel(settings, provider);
      const startedAt = Date.now();
      const base: Omit<AssistantMessage, 'content'> = { role: 'assistant', provider, model, createdAt: new Date().toISOString() };

      const finish = async (message: AssistantMessage) => {
        // 頁面正要重新載入換成新版：這次沒有結果可記。提問已經存好，重新載入後可以直接重新產生。
        if (isChunkReloadPending()) return;
        setPending(null);
        abort.current = null;
        await commit({ ...conversation, messages: [...conversation.messages, message] });
      };

      if (!key) {
        await finish({
          ...base,
          content: '',
          error: { code: 'invalid_key', message: '還沒有設定這家供應商的金鑰。請到設定頁貼上金鑰。' },
        });
        return;
      }

      const controller = new AbortController();
      abort.current = controller;
      setPending({ phase: 'waiting', text: '', startedAt, provider, model });

      let text = '';
      let notice: string | undefined;
      const message = (extra: Partial<AssistantMessage>): AssistantMessage => ({ ...base, content: text, ...(notice ? { notice } : {}), ...extra });

      try {
        const today = todayString();
        const system = buildSystemPrompt({
          school: perspective,
          verbosity: settings.verbosity,
          customPerspective: settings.customPerspective,
          today,
          chartContext: serializeChart(chart, computeHoroscope(saved.input, saved.chartSettings, today), {
            school: perspective,
            // 預設不送稱呼與出生年月日（HANDOFF 第 6.1 節）。
            ...(settings.includeBirthDate ? { birth: saved.input } : {}),
          }),
        });

        const llm = await getProvider(provider);
        const stream = llm.streamChat(
          key,
          {
            provider,
            model,
            system,
            messages: toChatMessages(conversation.messages),
            ...(settings.effort === 'default' ? {} : { effort: settings.effort }),
          },
          controller.signal,
        );

        for await (const event of stream) {
          if (event.type === 'status') {
            setPending((state) => (state && state.phase === 'waiting' ? { ...state, phase: 'thinking' } : state));
          } else if (event.type === 'text') {
            text += event.delta;
            const snapshot = text;
            setPending((state) => (state ? { ...state, phase: 'streaming', text: snapshot } : state));
          } else if (event.type === 'notice') {
            notice = event.message;
          } else if (event.type === 'done') {
            let costUSD: number | null | undefined;
            if (event.usage) {
              // 費用依回覆當下的價格表估算並存下來，之後價目變動也不會改寫歷史。
              const { table } = await loadPricing();
              costUSD = estimateCostUSD(table, model, event.usage.inputTokens, event.usage.outputTokens);
              recordUsage(provider, model, event.usage, costUSD);
            }
            await finish(
              message({
                ...(event.usage ? { usage: event.usage, costUSD: costUSD ?? null } : {}),
                ...(event.truncated ? { incomplete: 'truncated' } : {}),
              }),
            );
            return;
          } else {
            // 串流中斷時保留已收到的文字。
            await finish(message({ error: { code: event.code, message: event.message }, ...(text ? { incomplete: 'interrupted' } : {}) }));
            return;
          }
        }

        // 沒有收到結束事件：使用者按了停止。
        if (text) await finish(message({ incomplete: 'stopped' }));
        else {
          setPending(null);
          abort.current = null;
        }
      } catch (error) {
        // 網站剛更新過：這個分頁要用的 AI 模組已經不在伺服器上。重新載入後，提問還在，可以直接重新產生。
        const stale = error instanceof ModuleLoadError || isChunkLoadError(error);
        if (stale && reloadForStaleChunks()) return;
        await finish(
          message({
            error: {
              code: 'unknown',
              message: stale
                ? '網站剛更新過，這個分頁還是舊版，AI 模組載入失敗。請重新整理頁面，再按「重新產生」。'
                : '提問時發生未預期的錯誤。請再試一次；如果持續發生，請重新整理頁面。',
            },
            ...(text ? { incomplete: 'interrupted' } : {}),
          }),
        );
      }
    },
    [chart, commit, perspective, provider, saved],
  );

  const send = useCallback(
    async (rawText: string, quick?: Pick<QuickPrompt, 'palaces'>, options?: SendOptions) => {
      const text = rawText.trim();
      if (!text || abort.current) return;
      setProblem('');
      const existing = live.current && live.current.id === currentId ? live.current : current;
      const base = options?.fresh ? createConversation(saved.id) : (existing ?? createConversation(saved.id));
      const attachment = buildAttachment({ chart, saved, text, palaceNames: quick?.palaces ?? [], selectedPalace, limits, extra: options?.extra });
      const userMessage: UserMessage = {
        role: 'user',
        content: text,
        ...(attachment ? { attachment } : {}),
        createdAt: new Date().toISOString(),
      };
      const conversation: Conversation = {
        ...base,
        title: base.messages.length === 0 ? titleFrom(text) : base.title,
        messages: [...base.messages, userMessage],
      };
      await commit(conversation);
      await run(conversation);
    },
    [chart, commit, current, currentId, limits, run, saved, selectedPalace],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
  }, []);

  const regenerate = useCallback(async () => {
    if (!current || abort.current) return;
    const messages: Message[] = [...current.messages];
    // 拿掉最後一輪的回覆（可能連續有失敗的幾則），從最後一則提問重新產生。
    while (messages.at(-1)?.role === 'assistant') messages.pop();
    if (messages.length === 0) return;
    const conversation = { ...current, messages };
    await commit(conversation);
    await run(conversation);
  }, [commit, current, run]);

  const continueReply = useCallback(() => send(CONTINUE_MESSAGE), [send]);

  const startNew = useCallback(() => {
    if (abort.current) return;
    live.current = null;
    setCurrentId(null);
  }, []);

  const select = useCallback((id: string) => {
    if (abort.current) return;
    live.current = null;
    setCurrentId(id);
  }, []);

  const rename = useCallback(
    async (title: string) => {
      const next = title.trim();
      if (!current || !next) return;
      await commit({ ...current, title: next.slice(0, 40) });
    },
    [commit, current],
  );

  const remove = useCallback(async () => {
    if (!current || abort.current) return;
    const id = current.id;
    live.current = null;
    setConversations((list) => (list ?? []).filter((item) => item.id !== id));
    setCurrentId((conversations ?? []).find((item) => item.id !== id)?.id ?? null);
    try {
      await deleteConversation(id);
    } catch {
      setProblem('對話刪除失敗，請重新整理後再試一次。');
    }
  }, [conversations, current]);

  return { conversations, current, pending, problem, send, stop, regenerate, continueReply, startNew, select, rename, remove };
}
