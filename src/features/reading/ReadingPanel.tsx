import { lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { recommendedModels } from '../../lib/llm/models.config';
import { PROVIDER_NAMES, type ProviderId } from '../../lib/llm/types';
import { effectiveModel, useModelLists, useSettings } from '../settings/store';
import { parseReply } from './followups';
import { palacePrompt, QUICK_PROMPTS, type QuickPrompt } from './prompts';
import { SCHOOL_NAME, type School } from './serialize';
import type { AssistantMessage, UserMessage } from './types';
import type { Pending, Reading } from './useReading';

// Markdown 套件有回覆要顯示時才載入；載入前先用純文字顯示，內容不會消失。
const LazyMarkdown = lazy(() => import('./Markdown').then((module) => ({ default: module.Markdown })));

function Markdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="reading-prose whitespace-pre-wrap">{text}</div>}>
      <LazyMarkdown text={text} />
    </Suspense>
  );
}

const smallButton = 'rounded-control border border-line px-3 py-1 font-kai text-[0.9375rem] leading-normal disabled:border-line-soft disabled:text-ink-muted';
const selectClass = 'min-w-0 rounded-control border border-line bg-bg px-2 py-1 text-[0.9375rem] text-ink';

/** 對話太長的門檻（HANDOFF 第 6.5 節）。 */
const LONG_CONVERSATION = 20;

function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

function UserBubble({ message }: { message: UserMessage }) {
  return (
    <div className="border-l-2 border-line pl-3">
      {message.attachment && <p className="text-sm text-ink-muted">已帶入：{message.attachment.label}</p>}
      <p className="whitespace-pre-wrap font-kai text-[1.0625rem]">{message.content}</p>
    </div>
  );
}

const INCOMPLETE_TEXT: Record<NonNullable<AssistantMessage['incomplete']>, string> = {
  truncated: '回覆到達長度上限，沒有寫完。',
  stopped: '已停止，回覆沒有寫完。',
  interrupted: '回覆中途中斷，以上是已經收到的內容。',
};

type ReplyProps = {
  message: AssistantMessage;
  isLast: boolean;
  busy: boolean;
  reading: Reading;
};

function Reply({ message, isLast, busy, reading }: ReplyProps) {
  const { body, followups } = parseReply(message.content);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      {body && (
        <div data-reply>
          <Markdown text={body} />
        </div>
      )}

      {message.incomplete && <p className="mt-2 text-sm text-ink-muted">{INCOMPLETE_TEXT[message.incomplete]}</p>}
      {message.notice && <p className="mt-2 text-sm text-ink-muted">{message.notice}</p>}
      {message.error && (
        <p role="alert" className="mt-2 max-w-[34em] border-l-2 border-danger pl-3 text-danger">
          {message.error.message}
        </p>
      )}

      <p className="mt-2 text-sm text-ink-muted">
        {PROVIDER_NAMES[message.provider]}　{message.model}
        {message.usage && `　輸入 ${message.usage.inputTokens.toLocaleString()}、輸出 ${message.usage.outputTokens.toLocaleString()} token`}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {body && (
          <button type="button" className={smallButton} onClick={() => void copy()}>
            {copied ? '已複製' : '複製回覆'}
          </button>
        )}
        {isLast && (
          <button type="button" className={smallButton} disabled={busy} onClick={() => void reading.regenerate()}>
            重新產生
          </button>
        )}
        {isLast && message.incomplete && body && (
          <button type="button" className={smallButton} disabled={busy} onClick={() => void reading.continueReply()}>
            繼續寫完
          </button>
        )}
      </div>

      {isLast && followups.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-ink-muted">可以接著問</p>
          <div className="chip-row chip-wrap mt-1">
            {followups.map((question) => (
              <button key={question} type="button" className="chip" disabled={busy} onClick={() => void reading.send(question)}>
                {question}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingReply({ pending, onStop }: { pending: Pending; onStop: () => void }) {
  const waiting = pending.phase !== 'streaming';
  const seconds = useElapsedSeconds(waiting ? pending.startedAt : null);
  const { body } = parseReply(pending.text);
  return (
    <div>
      {body && <Markdown text={body} />}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p role="status" className="font-kai text-ink-muted">
          {waiting ? `推演中，已等待 ${seconds} 秒` : '回覆中'}
        </p>
        <button type="button" className={smallButton} onClick={onStop}>
          停止
        </button>
      </div>
      {waiting && seconds >= 8 && <p className="mt-1 max-w-[34em] text-sm text-ink-muted">推理型模型在寫出第一個字之前，可能要等數十秒。</p>}
    </div>
  );
}

type Props = {
  reading: Reading;
  /** 已設定金鑰的供應商 */
  configured: readonly ProviderId[];
  provider: ProviderId | null;
  /** 選中的宮位名稱，沒有選時為 null */
  selectedPalaceName: string | null;
  headingId: string;
  perspective: School;
  onPerspectiveChange: (school: School) => void;
  /** 盤上選中的運限，下一則提問會帶入；沒有時為 null */
  attachedLimits: string | null;
};

const PERSPECTIVES: readonly School[] = ['sanhe', 'feixing', 'panel', 'custom'];

/** 解讀面板：命盤旁邊的對話。 */
export function ReadingPanel({
  reading,
  configured,
  provider,
  selectedPalaceName,
  headingId,
  perspective,
  onPerspectiveChange,
  attachedLimits,
}: Props) {
  const id = useId();
  const settings = useSettings();
  const liveList = useModelLists((state) => (provider ? state.lists[provider] : undefined));
  const [draft, setDraft] = useState('');
  const [quote, setQuote] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const { current, conversations, pending } = reading;
  const busy = pending !== null;
  const messages = current?.messages ?? [];
  const lastIndex = messages.length - 1;

  // 選取回覆中的文字時，提供「追問這段」。
  useEffect(() => {
    function onSelectionChange() {
      const selection = document.getSelection();
      const text = selection?.toString().trim() ?? '';
      const anchor = selection?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      setQuote(text && element?.closest('[data-reply]') ? text.slice(0, 400) : '');
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // 新內容出現時，讓最新的回覆留在視線內（手機鍵盤彈出時也一樣）。
  const messageCount = messages.length;
  const pendingLength = pending?.text.length ?? 0;
  useEffect(() => {
    if (messageCount === 0 && pendingLength === 0) return;
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messageCount, pendingLength]);

  if (configured.length === 0 || !provider) {
    return (
      <div className="max-w-[34em]">
        <h2 id={headingId} className="text-[1.5rem]">
          解讀
        </h2>
        <p className="mt-3">要請 AI 依這張盤回答問題，需要先設定你自己的 OpenAI 或 Claude API 金鑰。命盤本身不需要金鑰就能完整使用。</p>
        <p className="mt-3">
          <Link to="/settings" className="inline-block rounded-control bg-accent px-4 py-2 font-kai font-bold text-accent-ink">
            前往設定
          </Link>
        </p>
      </div>
    );
  }

  const models = liveList ?? recommendedModels(provider);
  const model = effectiveModel(settings, provider);
  const modelKnown = models.some((item) => item.id === model);

  function submit(text: string, quick?: QuickPrompt) {
    if (busy || !text.trim()) return;
    setDraft('');
    setQuote('');
    document.getSelection()?.removeAllRanges();
    void reading.send(text, quick);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // 注音、倉頡等輸入法選字時的 Enter 不送出。
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  }

  function askAboutQuote() {
    const quoted = quote
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    setDraft(`${quoted}\n\n`);
    setQuote('');
    textarea.current?.focus();
  }

  const quicks: QuickPrompt[] = [...(selectedPalaceName ? [palacePrompt(selectedPalaceName)] : []), ...QUICK_PROMPTS];
  const hasReply = messages.some((message) => message.role === 'assistant');

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={headingId} className="text-[1.5rem]">
          解讀
        </h2>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label htmlFor={`${id}-provider`} className="sr-only">
            供應商
          </label>
          <select
            id={`${id}-provider`}
            className={selectClass}
            value={provider}
            disabled={busy}
            onChange={(event) => settings.update({ defaultProvider: event.target.value as ProviderId })}
          >
            {configured.map((item) => (
              <option key={item} value={item}>
                {PROVIDER_NAMES[item]}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-model`} className="sr-only">
            模型
          </label>
          <select
            id={`${id}-model`}
            className={`${selectClass} max-w-[14rem]`}
            value={model}
            disabled={busy}
            onChange={(event) => {
              // 在面板換模型時，清掉自訂 ID，改用選到的模型。
              settings.setCustomModel(provider, '');
              settings.setModel(provider, event.target.value);
            }}
          >
            {!modelKnown && <option value={model}>{model}</option>}
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
                {item.recommended ? '（推薦）' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {conversations !== null && conversations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-conversation`} className="sr-only">
            對話
          </label>
          <select
            id={`${id}-conversation`}
            className={`${selectClass} w-full basis-full lg:w-auto lg:basis-0 lg:flex-1`}
            value={current?.id ?? ''}
            disabled={busy}
            onChange={(event) => (event.target.value ? reading.select(event.target.value) : reading.startNew())}
          >
            {!current && <option value="">新對話（尚未提問）</option>}
            {conversations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <button type="button" className={smallButton} disabled={busy || !current} onClick={reading.startNew}>
            開新對話
          </button>
          {current && renaming === null && !confirmingDelete && (
            <>
              <button type="button" className={smallButton} disabled={busy} onClick={() => setRenaming(current.title)}>
                重新命名
              </button>
              <button type="button" className={smallButton} disabled={busy} onClick={() => setConfirmingDelete(true)}>
                刪除對話
              </button>
            </>
          )}
          {current && renaming !== null && (
            <form
              className="flex w-full flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void reading.rename(renaming);
                setRenaming(null);
              }}
            >
              <label htmlFor={`${id}-title`} className="sr-only">
                對話名稱
              </label>
              <input
                id={`${id}-title`}
                className={`${selectClass} flex-1`}
                value={renaming}
                maxLength={40}
                autoFocus
                onChange={(event) => setRenaming(event.target.value)}
              />
              <button type="submit" className={smallButton}>
                儲存名稱
              </button>
              <button type="button" className={smallButton} onClick={() => setRenaming(null)}>
                取消
              </button>
            </form>
          )}
          {current && confirmingDelete && (
            <>
              <button
                type="button"
                className="rounded-control bg-danger px-3 py-1 font-kai text-[0.9375rem] text-bg"
                onClick={() => {
                  setConfirmingDelete(false);
                  void reading.remove();
                }}
              >
                確定刪除這段對話
              </button>
              <button type="button" className={smallButton} onClick={() => setConfirmingDelete(false)}>
                保留
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-perspective`} className="font-kai text-ink-muted">
          視角
        </label>
        <select
          id={`${id}-perspective`}
          className={selectClass}
          value={perspective}
          disabled={busy}
          onChange={(event) => onPerspectiveChange(event.target.value as School)}
        >
          {PERSPECTIVES.map((school) => (
            <option key={school} value={school}>
              {SCHOOL_NAME[school]}
            </option>
          ))}
        </select>
        {perspective === 'custom' && !settings.customPerspective.trim() && (
          <p className="basis-full text-sm text-ink-muted">
            還沒有填自訂視角的內容，會先用三合派解讀。可以到 <Link to="/settings" className="text-accent underline underline-offset-4">設定頁的「排盤」</Link> 填寫。
          </p>
        )}
      </div>

      <div>
        <p className="sr-only" id={`${id}-quick`}>
          快捷提問
        </p>
        <div className="chip-row" role="group" aria-labelledby={`${id}-quick`}>
          {quicks.map((quick) => (
            <button key={quick.id} type="button" className="chip" disabled={busy} onClick={() => submit(quick.message, quick)}>
              {quick.label}
            </button>
          ))}
        </div>
      </div>

      {reading.problem && (
        <p role="alert" className="max-w-[34em] border-l-2 border-danger pl-3 text-danger">
          {reading.problem}
        </p>
      )}

      {(messages.length > 0 || pending) && (
        <div className="grid gap-6" aria-label="對話內容">
          {messages.map((message, index) =>
            message.role === 'user' ? (
              <UserBubble key={index} message={message} />
            ) : (
              <Reply key={index} message={message} isLast={index === lastIndex && !pending} busy={busy} reading={reading} />
            ),
          )}
          {pending && <PendingReply pending={pending} onStop={reading.stop} />}
        </div>
      )}

      {messages.length > LONG_CONVERSATION && (
        <p className="max-w-[34em] text-sm text-ink-muted">對話已經很長，開新對話會更省。舊的訊息不會被自動刪除。</p>
      )}

      <div ref={end} />

      {/* 輸入區：手機上固定在底部導覽列上方。 */}
      <div className="sticky bottom-14 z-10 -mx-4 border-t border-line-soft bg-bg px-4 pb-2 pt-3 lg:static lg:mx-0 lg:border-0 lg:p-0">
        {quote && (
          <button type="button" className={`${smallButton} mb-2`} onMouseDown={(event) => event.preventDefault()} onClick={askAboutQuote}>
            追問這段
          </button>
        )}
        {(attachedLimits || selectedPalaceName) && (
          <p className="mb-2 text-sm text-ink-muted">
            下一則提問會帶入：{[selectedPalaceName, attachedLimits].filter(Boolean).join('、')}
          </p>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <label htmlFor={`${id}-input`} className="sr-only">
            提問
          </label>
          <textarea
            id={`${id}-input`}
            ref={textarea}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-y rounded-control border border-line bg-bg px-3 py-2 font-serif text-base leading-normal text-ink"
            rows={draft.includes('\n') ? 4 : 1}
            value={draft}
            placeholder="輸入問題"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-control bg-accent px-4 py-2 font-kai font-bold text-accent-ink disabled:opacity-50"
          >
            送出提問
          </button>
        </form>
        <p className="mt-2 max-w-[34em] text-sm text-ink-muted">
          <span className="hidden lg:inline">Enter 送出，Shift+Enter 換行。</span>
          送出後，你的提問與命盤內容
          {settings.includeBirthDate ? '（含四柱、稱呼與出生年月日）' : '（含四柱干支，不含稱呼與出生年月日）'}
          會由瀏覽器直接送給 {PROVIDER_NAMES[provider]}，並依該供應商的政策處理。
          {hasReply && '追問會重送整段對話，對話越長花費越多。'}
        </p>
      </div>
    </div>
  );
}
