import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BirthForm } from '../features/chart/BirthForm';
import { useEngine } from '../features/chart/engineLoader';
import { saveChart } from '../features/chart/store';
import { TIME_SLOTS } from '../features/chart/time';
import type { BirthInput } from '../features/chart/types';
import { compareWithImage, IMPORT_PROMPT, IMPORT_SYSTEM, parseExtraction, toBirthDraft, type Extraction } from '../features/import/extract';
import { getKey } from '../features/settings/keys';
import { configuredProviders } from '../features/settings/ModelSection';
import { effectiveModel, useSettings } from '../features/settings/store';
import { recordUsage } from '../features/settings/usage';
import { ImageError, prepareImage, type PreparedImage } from '../lib/image';
import { getProvider, ModuleLoadError } from '../lib/llm';
import { estimateCostUSD, formatUSD, loadPricing } from '../lib/llm/pricing';
import { LLMError, PROVIDER_NAMES } from '../lib/llm/types';

const button = 'rounded-control border border-line px-4 py-2 font-kai disabled:border-line-soft disabled:text-ink-muted';

/** 把縮小後的畫面畫到頁面上的畫布當預覽（不用 <img>，CSP 的 img-src 只允許本站）。 */
function Preview({ image }: { image: PreparedImage }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    canvas.current?.getContext('2d')?.drawImage(image.canvas, 0, 0);
  }, [image]);
  return (
    <canvas
      ref={canvas}
      width={image.width}
      height={image.height}
      role="img"
      aria-label="你選的命盤圖片"
      className="block h-auto max-h-[420px] w-auto max-w-full border border-line"
    />
  );
}

type Result = { extraction: Extraction; usage: string };

/** 截圖匯入（CR-17）：請 AI 讀出圖上的出生資料，核對後由程式排盤。 */
export function Import() {
  const navigate = useNavigate();
  const engine = useEngine();
  useSettings((state) => state.keyStatus);
  useSettings((state) => state.keyStorage);
  const settings = useSettings();
  const configured = configuredProviders();
  const provider = settings.defaultProvider && configured.includes(settings.defaultProvider) ? settings.defaultProvider : (configured[0] ?? null);
  const model = provider ? effectiveModel(settings, provider) : '';

  const [image, setImage] = useState<PreparedImage | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  async function choose(file: Blob | undefined, name: string) {
    if (!file) return;
    abort.current?.abort();
    setError('');
    setResult(null);
    setImage(null);
    setFileName(name);
    try {
      setImage(await prepareImage(file));
    } catch (cause) {
      setError(cause instanceof ImageError ? cause.message : '圖片處理失敗，請換一張圖再試。');
    }
  }

  // 可以直接貼上剪貼簿裡的截圖。
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith('image/'));
      if (file) {
        event.preventDefault();
        void choose(file, '貼上的圖片');
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  async function read() {
    if (!image || !provider) return;
    const key = getKey(provider);
    if (!key) return setError('還沒有設定這家供應商的金鑰。請到設定頁貼上金鑰。');
    const controller = new AbortController();
    abort.current = controller;
    setReading(true);
    setError('');
    setResult(null);
    try {
      const llm = await getProvider(provider);
      const reply = await llm.readImage(
        key,
        { model, system: IMPORT_SYSTEM, prompt: IMPORT_PROMPT, image: { mediaType: image.mediaType, base64: image.base64 } },
        controller.signal,
      );
      if (controller.signal.aborted) return;

      let usage = '';
      if (reply.usage) {
        const { table } = await loadPricing();
        const cost = estimateCostUSD(table, model, reply.usage.inputTokens, reply.usage.outputTokens);
        recordUsage(provider, model, reply.usage, cost);
        usage = `輸入 ${reply.usage.inputTokens.toLocaleString()}、輸出 ${reply.usage.outputTokens.toLocaleString()} token　${cost === null ? '費率未知' : `約 ${formatUSD(cost)}`}`;
      }

      const extraction = parseExtraction(reply.text);
      if (!extraction) {
        setError('AI 的回覆讀不出資料。可以再試一次，或換一個模型；也可以直接在排盤頁手動輸入。');
      } else if (!extraction.found) {
        setError('AI 判斷這張圖不是紫微斗數命盤。請確認選對圖片，或直接在排盤頁手動輸入。');
      } else {
        setResult({ extraction, usage });
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof LLMError
          ? cause.message
          : cause instanceof ModuleLoadError
            ? '網站剛更新過，請重新整理頁面後再試一次。'
            : '讀取圖片時發生未預期的錯誤，請再試一次。',
      );
    } finally {
      if (abort.current === controller) abort.current = null;
      setReading(false);
    }
  }

  const prepared = useMemo(() => (result ? toBirthDraft(result.extraction) : null), [result]);

  // 用讀到的資料試排一次，和圖上抄下來的命宮、五行局比對。
  const checks = useMemo(() => {
    if (!result || !prepared || !engine) return null;
    const { draft } = prepared;
    if (!draft.gender || !draft.year || !draft.month || !draft.day || draft.timeIndex === undefined) return null;
    const input: BirthInput = {
      name: draft.name ?? '我',
      gender: draft.gender,
      calendar: draft.calendar ?? 'solar',
      date: `${draft.year}-${draft.month}-${draft.day}`,
      timeIndex: draft.timeIndex,
      ...(draft.calendar === 'lunar' ? { isLeapMonth: draft.isLeapMonth === true } : {}),
    };
    try {
      return compareWithImage(engine.computeChart(input, settings.chartDefaults), result.extraction);
    } catch {
      return null;
    }
  }, [engine, prepared, result, settings.chartDefaults]);

  async function handleSubmit(input: BirthInput) {
    const saved = await saveChart(input, useSettings.getState().chartDefaults);
    await navigate(`/chart/${saved.id}`, { state: { fresh: true } });
  }

  const mismatched = checks?.some((check) => !check.matches) ?? false;

  return (
    <div className="max-w-[60rem] xl:max-w-none">
      <p className="text-sm">
        <Link to="/" className="text-accent underline underline-offset-4">
          回到排盤
        </Link>
      </p>
      <h1 className="mt-2 text-[1.75rem] md:text-[2.25rem]">從命盤截圖帶入</h1>
      <p className="mt-3 max-w-[34em]">
        已經有別處排好的命盤圖片嗎？請 AI 讀出圖上的出生資料，帶進表單給你核對，再由本站的排盤程式重新排出命盤。AI 只讀圖上的文字，不負責排盤，圖上的星曜也不會被匯入。
      </p>

      {/* 寬螢幕：左欄選圖與讀取，右欄核對與排盤。 */}
      <div className="xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-16">
      <div className="min-w-0">
      {!provider ? (
        <div className="mt-6 max-w-[34em] border-l-2 border-line pl-3">
          <p>讀圖需要 AI，請先設定你自己的 OpenAI 或 Claude API 金鑰。沒有金鑰也可以在排盤頁手動輸入出生資料。</p>
          <p className="mt-3">
            <Link to="/settings" className="inline-block rounded-control bg-accent px-4 py-2 font-kai font-bold text-accent-ink">
              前往設定
            </Link>
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="import-pick" className="mt-8">
            <h2 id="import-pick" className="text-[1.375rem]">
              選擇圖片
            </h2>
            <div className="mt-3">
              <label htmlFor="import-file" className="font-kai text-[1.0625rem] font-bold">
                命盤的截圖或照片
              </label>
              <input
                id="import-file"
                type="file"
                accept="image/*"
                className="mt-1 block w-full max-w-[28rem] rounded-control border border-line bg-bg px-3 py-2 text-base text-ink file:mr-3 file:rounded-control file:border file:border-line file:bg-bg file:px-3 file:py-1 file:font-kai file:text-ink"
                onChange={(event) => void choose(event.target.files?.[0], event.target.files?.[0]?.name ?? '')}
              />
              <p className="mt-1 text-sm text-ink-muted">也可以在這個頁面直接貼上剪貼簿裡的截圖。圖片只在你的瀏覽器裡處理，不會存下來。</p>
            </div>

            {image && (
              <div className="mt-4">
                <Preview image={image} />
                <p className="mt-1 text-sm text-ink-muted">
                  {fileName}　送出時會縮成 {image.width}×{image.height}（約 {Math.round(image.bytes / 1024)} KB）
                </p>
              </div>
            )}
          </section>

          {image && (
            <section aria-labelledby="import-read" className="mt-8">
              <h2 id="import-read" className="text-[1.375rem]">
                讀取出生資料
              </h2>
              <p className="mt-2 max-w-[34em] border-l-2 border-line pl-3">
                按下按鈕後，這張圖會由你的瀏覽器直接送給 {PROVIDER_NAMES[provider]}（模型：{model}），並依該供應商的政策處理。圖上的姓名、生日與整張命盤都會一併送出；本站沒有伺服器會收到它。
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" className="rounded-control bg-accent px-4 py-2 font-kai font-bold text-accent-ink disabled:opacity-60" disabled={reading} onClick={() => void read()}>
                  {reading ? '讀取中' : '把圖片送給 AI 讀取出生資料'}
                </button>
                {reading && (
                  <button type="button" className={button} onClick={() => abort.current?.abort()}>
                    停止
                  </button>
                )}
              </div>
              <p role="status" className="mt-2 min-h-[1.6em] text-sm text-ink-muted">
                {reading ? '正在讀取，通常需要十幾秒。' : (result?.usage ?? '')}
              </p>
            </section>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 max-w-[34em] border-l-2 border-danger pl-3 text-danger">
          {error}
        </p>
      )}
      </div>

      {result && prepared && (
        <section aria-labelledby="import-confirm" className="mt-8 min-w-0">
          <h2 id="import-confirm" className="text-[1.375rem]">
            核對後排出命盤
          </h2>
          <p className="mt-2 max-w-[34em]">
            以下是 AI 從圖上讀到的資料，已經帶進表單。AI 可能讀錯，請逐欄核對，有錯就直接改。
          </p>
          {prepared.missing.length > 0 && (
            <p className="mt-2 max-w-[34em] border-l-2 border-line pl-3">圖上讀不到：{prepared.missing.join('、')}。請自己補上。</p>
          )}
          {result.extraction.solar && result.extraction.lunar && (
            <p className="mt-2 max-w-[34em] text-sm text-ink-muted">
              圖上同時有國曆與農曆生日，表單用的是國曆（{result.extraction.solar.year} 年 {result.extraction.solar.month} 月 {result.extraction.solar.day} 日）。圖上的農曆是{' '}
              {result.extraction.lunar.year} 年{result.extraction.lunar.isLeapMonth ? '閏' : ''} {result.extraction.lunar.month} 月 {result.extraction.lunar.day} 日，排出後可以對照。
            </p>
          )}
          {result.extraction.notes && <p className="mt-2 max-w-[34em] text-sm text-ink-muted">AI 的備註：{result.extraction.notes}</p>}

          {checks && checks.length > 0 && (
            <div className="mt-4 max-w-[40rem]">
              <table className="w-full border-collapse text-[0.9375rem]">
                <caption className="pb-2 text-left font-kai text-[1.125rem] font-bold">和圖上的命盤比對</caption>
                <thead>
                  <tr className="border-b border-line text-left font-kai">
                    {['項目', '圖上寫的', '本站排出的', '結果'].map((heading) => (
                      <th key={heading} scope="col" className="py-1 pr-3 font-normal text-ink-muted">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checks.map((check) => (
                    <tr key={check.item} className="border-b border-line-soft">
                      <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-kai font-bold">
                        {check.item}
                      </th>
                      <td className="py-1 pr-3 font-kai">{check.fromImage}</td>
                      <td className="py-1 pr-3 font-kai">{check.computed}</td>
                      <td className={`whitespace-nowrap py-1 pr-3 font-kai ${check.matches ? '' : 'text-danger'}`}>{check.matches ? '相符' : '不相符'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 max-w-[34em] text-sm text-ink-muted">
                {mismatched
                  ? '有項目不相符。常見原因：AI 讀錯生日或時辰、原圖的晚子時或年分界算法不同、原圖用的是別的安星法。請先核對表單，再到設定頁的「排盤」比較不同設定。'
                  : `讀到的資料排出來和圖上一致（${TIME_SLOTS[prepared.draft.timeIndex ?? 0]?.name ?? ''}）。`}
              </p>
            </div>
          )}

          <div className="mt-6">
            <BirthForm key={JSON.stringify(prepared.draft)} initial={prepared.draft} onSubmit={handleSubmit} />
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
