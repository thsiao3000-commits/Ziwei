import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { CentreInfo } from '../features/chart/CentreInfo';
import { ChartBoard } from '../features/chart/ChartBoard';
import { DensityControl } from '../features/chart/DensityControl';
import { computeChart, computeHoroscope, computeLimits } from '../features/chart/engine';
import { renderChartImage } from '../features/chart/exportImage';
import { LimitControls } from '../features/chart/LimitControls';
import { PalaceDetail } from '../features/chart/PalaceDetail';
import { getChart, touchChart, updateChart } from '../features/chart/store';
import { NO_LIMITS, type ChartData, type ChartSettings, type LimitSelection, type SavedChart } from '../features/chart/types';
import { conversationToMarkdown } from '../features/reading/exportMarkdown';
import { palacePrompt } from '../features/reading/prompts';
import { ReadingPanel } from '../features/reading/ReadingPanel';
import { todayString } from '../features/reading/request';
import { serializeLimits, type School } from '../features/reading/serialize';
import { useReading } from '../features/reading/useReading';
import { configuredProviders } from '../features/settings/ModelSection';
import { defaultDensity, usePreferences } from '../features/settings/preferences';
import { useSettings } from '../features/settings/store';
import { downloadBlob, safeFilename } from '../lib/download';

type Loaded =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; saved: SavedChart; chart: ChartData };

function useChart(chartId: string | undefined, version: number): Loaded {
  const [state, setState] = useState<Loaded>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!chartId) return setState({ status: 'missing' });
      try {
        const saved = await getChart(chartId);
        if (cancelled) return;
        if (!saved) return setState({ status: 'missing' });
        // 只存輸入與設定，每次開啟重新計算。
        setState({ status: 'ready', saved, chart: computeChart(saved.input, saved.chartSettings) });
        // 記下最後開啟時間，給「我的命盤」排序用。失敗不影響看盤。
        void touchChart(saved.id).catch(() => undefined);
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            message: '讀不到這台裝置上的命盤資料。請確認瀏覽器沒有停用網站儲存空間，再重新整理。',
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [chartId, version]);

  return state;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="chart-title">
      <h1 id="chart-title" className="text-[1.75rem] md:text-[2.25rem]">
        {title}
      </h1>
      <p className="mt-4 max-w-[34em]">{children}</p>
      <p className="mt-4">
        <Link to="/" className="text-accent underline underline-offset-4">
          回到排盤
        </Link>
      </p>
    </section>
  );
}

export type PendingAsk = { message: string; extra: { label: string; text: string } };

type ReadyProps = { saved: SavedChart; chart: ChartData; fresh: boolean; onRecast: () => void; pendingAsk: PendingAsk | null };

function ChartView({ saved, chart, fresh, onRecast, pendingAsk }: ReadyProps) {
  const [selected, setSelected] = useState<number | null>(null);
  // 桌機側欄的分頁：解讀，或選中宮位的詳情。
  const [tab, setTab] = useState<'reading' | 'detail'>('reading');
  const stored = usePreferences((state) => state.density);
  const setDensity = usePreferences((state) => state.setDensity);
  const [fallback] = useState(defaultDensity);
  const density = stored ?? fallback;

  // 訂閱金鑰狀態：設定頁改了金鑰，回到這裡要反映出來。
  useSettings((state) => state.keyStatus);
  useSettings((state) => state.keyStorage);
  const defaultProvider = useSettings((state) => state.defaultProvider);
  const configured = configuredProviders();
  const provider = defaultProvider && configured.includes(defaultProvider) ? defaultProvider : (configured[0] ?? null);

  const [sheetOpen, setSheetOpen] = useState(true);

  // 運限：大限 → 流年 → 流月，疊在本命盤上。
  const [limitSelection, setLimitSelection] = useState<LimitSelection>(NO_LIMITS);
  const limits = useMemo(() => computeLimits(saved.input, saved.chartSettings, limitSelection), [saved, limitSelection]);
  const limitAttachment = useMemo(() => serializeLimits(chart, limits), [chart, limits]);

  function jumpToToday() {
    const now = computeHoroscope(saved.input, saved.chartSettings, todayString());
    const decadal = limits.decadals.findIndex((item) => now.nominalAge >= item.ageRange[0] && now.nominalAge <= item.ageRange[1]);
    if (decadal === -1) return setLimitSelection(NO_LIMITS);
    const first = limits.decadals[decadal];
    const year = first ? first.yearRange[0] + (now.nominalAge - first.ageRange[0]) : null;
    setLimitSelection({ decadal, year, month: null });
  }

  // 解讀視角：預設用設定頁的解讀取向，提問時可以另選。
  const defaultSchool = useSettings((state) => state.school);
  const [perspective, setPerspective] = useState<School>(defaultSchool);

  // 這張盤排盤當時的設定，和目前設定頁的排盤設定不同時，提供重排。
  const chartDefaults = useSettings((state) => state.chartDefaults);
  const outdated = (Object.keys(chartDefaults) as (keyof ChartSettings)[]).some((key) => chartDefaults[key] !== saved.chartSettings[key]);
  const [recastError, setRecastError] = useState('');

  async function recast() {
    try {
      await updateChart(saved.id, { chartSettings: chartDefaults });
      onRecast();
    } catch {
      setRecastError('重排失敗：命盤無法寫回這台裝置。請重新整理後再試。');
    }
  }

  const reading = useReading({ saved, chart, selectedPalace: selected, provider, perspective, limits: limitAttachment });

  // 匯出：命盤圖（PNG）與解讀（Markdown）。都在瀏覽器裡產生，不送出任何請求。
  const [anonymous, setAnonymous] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<{ text: string; failed: boolean } | null>(null);

  async function exportImage() {
    setExporting(true);
    setExportNote(null);
    try {
      const blob = await renderChartImage({
        chart,
        name: saved.input.name,
        density,
        overlay: limits.overlay,
        focus: selected ?? chart.soulPalaceIndex,
        anonymous,
      });
      downloadBlob(blob, anonymous ? '紫微命盤.png' : `紫微命盤-${safeFilename(saved.input.name, '命盤')}.png`);
      setExportNote({ text: anonymous ? '已下載命盤圖，圖上沒有稱呼與出生資料。' : '已下載命盤圖，圖上有稱呼與出生資料。', failed: false });
    } catch {
      setExportNote({ text: '命盤圖沒有產生成功。請重新整理頁面後再試一次。', failed: true });
    } finally {
      setExporting(false);
    }
  }

  function exportConversation() {
    const conversation = reading.current;
    if (!conversation) return;
    const markdown = conversationToMarkdown({ conversation, chart, name: saved.input.name, anonymous, exportedOn: todayString() });
    downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `紫微解讀-${safeFilename(conversation.title, '對話')}.md`);
    setExportNote({ text: `已下載這段對話（Markdown）${anonymous ? '，檔案裡沒有稱呼與出生資料' : ''}。`, failed: false });
  }

  // 從「時辰對照」頁按了「請 AI 協助分辨」過來：對話讀取完成後，開一段新對話送出一次。
  const navigate = useNavigate();
  const asked = useRef(false);
  const ready = reading.conversations !== null;
  const { send } = reading;
  useEffect(() => {
    if (!pendingAsk || !ready || !provider || asked.current) return;
    asked.current = true;
    void send(pendingAsk.message, { palaces: [] }, { fresh: true, extra: pendingAsk.extra });
    // 清掉路由狀態，重新整理時不會再問一次。
    void navigate('.', { replace: true, state: null });
  }, [navigate, pendingAsk, provider, ready, send]);
  const palace = selected === null ? undefined : chart.palaces[selected];

  function selectPalace(index: number | null) {
    setSelected(index);
    setTab(index === null ? 'reading' : 'detail');
  }

  /** 宮位詳情裡的「解讀這個宮位」。 */
  function interpret(name: string) {
    const quick = palacePrompt(name);
    setTab('reading');
    void reading.send(quick.message, quick);
    // 手機：收起抽屜（保留選取），捲到解讀面板。
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setSheetOpen(false);
      document.getElementById('reading-section')?.scrollIntoView({ block: 'start' });
    }
  }

  const canInterpret = provider !== null && reading.pending === null;

  const panel = (headingId: string) => (
    <ReadingPanel
      reading={reading}
      configured={configured}
      provider={provider}
      selectedPalaceName={palace?.name ?? null}
      headingId={headingId}
      onExport={exportConversation}
      perspective={perspective}
      onPerspectiveChange={setPerspective}
      attachedLimits={limitAttachment?.label ?? null}
    />
  );

  const detail = (headingId: string) =>
    palace && (
      <PalaceDetail
        key={palace.index}
        chart={chart}
        palace={palace}
        onClose={() => selectPalace(null)}
        headingId={headingId}
        onInterpret={canInterpret ? () => interpret(palace.name) : undefined}
      />
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10 2xl:grid-cols-[minmax(0,820px)_minmax(0,1fr)]">
      <section aria-labelledby="chart-title" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h1 id="chart-title" className="text-[1.5rem] md:text-[2rem]">
            {saved.input.name}的命盤
          </h1>
          <DensityControl value={density} onChange={setDensity} />
        </div>
        <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link to={`/rectify/${saved.id}`} className="text-accent underline underline-offset-4">
            不確定出生時辰？比較相鄰時辰的命盤
          </Link>
          <Link to={`/compare/${saved.id}`} className="text-accent underline underline-offset-4">
            和另一張命盤合盤
          </Link>
          <Link to={`/months/${saved.id}`} className="text-accent underline underline-offset-4">
            流月財運一覽
          </Link>
        </p>
        <div className="w-full max-w-[820px]">
          <ChartBoard
            chart={chart}
            density={density}
            selected={selected}
            onSelect={(index) => {
              setSheetOpen(true);
              selectPalace(index);
            }}
            animate={fresh}
            label={`${saved.input.name}的命盤`}
            centre={<CentreInfo chart={chart} name={saved.input.name} />}
            overlay={limits.overlay}
          />
          <LimitControls limits={limits} onChange={setLimitSelection} onToday={jumpToToday} />
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          點宮位或用方向鍵移動、按 Enter，查看完整星曜與三方四正。選了運限後，各宮會疊上運限宮名（限＝大限、年＝流年、月＝流月）與運限四化。
        </p>
        <div className="mt-5 border-t border-line-soft pt-4">
          <h2 className="text-[1.125rem]">匯出</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              disabled={exporting}
              onClick={() => void exportImage()}
              className="rounded-control border border-line px-3 py-1 font-kai disabled:border-line-soft disabled:text-ink-muted"
            >
              {exporting ? '產生命盤圖中' : '下載命盤圖（PNG）'}
            </button>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={anonymous}
                onChange={(event) => setAnonymous(event.target.checked)}
              />
              不放稱呼與出生資料
            </label>
          </div>
          <p className="mt-2 max-w-[34em] text-sm text-ink-muted">
            命盤圖依目前的顯示密度、選中的宮位與運限產生。要傳給別人時，可以勾選「不放稱呼與出生資料」；這個選項也套用在匯出的對話。
          </p>
          <p aria-live="polite" className={`mt-1 min-h-[1.6em] text-sm ${exportNote?.failed ? 'text-danger' : 'text-ink-muted'}`}>
            {exportNote?.text}
          </p>
        </div>

        {outdated && (
          <div className="mt-4 max-w-[34em] border-l-2 border-line pl-3">
            <p>這張命盤用的是排盤當時的排盤設定，和目前設定頁的不同。</p>
            <button type="button" onClick={() => void recast()} className="mt-2 rounded-control border border-line px-3 py-1 font-kai">
              改用目前的設定重排
            </button>
            {recastError && (
              <p role="alert" className="mt-2 text-danger">
                {recastError}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 桌機：側欄，解讀與宮位詳情兩個分頁 */}
      <aside aria-label="解讀與宮位詳情" className="hidden min-w-0 border-l border-line pl-10 lg:block">
        {palace && (
          <div role="tablist" aria-label="側欄內容" className="mb-4 flex gap-1 border-b border-line-soft">
            {(
              [
                ['reading', '解讀'],
                ['detail', `${palace.name}詳情`],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`-mb-px border-b-2 px-3 py-2 font-kai ${tab === value ? 'border-line text-ink' : 'border-transparent text-ink-muted'}`}
              >
                {text}
              </button>
            ))}
          </div>
        )}
        {palace && tab === 'detail' ? detail('palace-detail-side') : panel('reading-side')}
      </aside>

      {/* 手機：解讀接在命盤下方 */}
      <section id="reading-section" aria-labelledby="reading-below" className="min-w-0 scroll-mt-4 lg:hidden">
        {panel('reading-below')}
      </section>

      {/* 手機：宮位詳情用底部抽屜。不擋住命盤，仍可繼續點其他宮位。 */}
      {palace && sheetOpen && (
        <div
          role="dialog"
          aria-labelledby="palace-detail-sheet"
          className="palace-sheet fixed inset-x-0 bottom-0 z-40 max-h-[58dvh] overflow-y-auto rounded-t-sheet border-t border-line bg-bg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 lg:hidden"
        >
          {detail('palace-detail-sheet')}
        </div>
      )}
    </div>
  );
}

export function Chart() {
  const { chartId } = useParams();
  const location = useLocation();
  const [version, setVersion] = useState(0);
  const loaded = useChart(chartId, version);

  // 從表單排出來的那一次才播放落位動畫；重新整理或從清單開啟不播。
  const state = location.state as { fresh?: boolean; ask?: PendingAsk } | null;
  const fresh = state?.fresh === true;

  if (loaded.status === 'loading') {
    return (
      <p role="status" className="text-ink-muted">
        讀取命盤中
      </p>
    );
  }
  if (loaded.status === 'missing') {
    return <Notice title="找不到這張命盤">這張命盤不在這台裝置上。命盤只存在排盤時用的那個瀏覽器，換裝置或清除網站資料後就看不到了。</Notice>;
  }
  if (loaded.status === 'error') {
    return <Notice title="無法開啟命盤">{loaded.message}</Notice>;
  }

  // 換一張命盤時整個重建，對話與選取狀態不會殘留。
  return (
    <ChartView
      key={`${loaded.saved.id}-${version}`}
      saved={loaded.saved}
      chart={loaded.chart}
      fresh={fresh && version === 0}
      onRecast={() => setVersion((current) => current + 1)}
      pendingAsk={state?.ask ?? null}
    />
  );
}
