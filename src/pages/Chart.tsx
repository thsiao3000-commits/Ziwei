import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { CentreInfo } from '../features/chart/CentreInfo';
import { ChartBoard } from '../features/chart/ChartBoard';
import { DensityControl } from '../features/chart/DensityControl';
import { computeChart } from '../features/chart/engine';
import { PalaceDetail } from '../features/chart/PalaceDetail';
import { getChart } from '../features/chart/store';
import type { ChartData, SavedChart } from '../features/chart/types';
import { palacePrompt } from '../features/reading/prompts';
import { ReadingPanel } from '../features/reading/ReadingPanel';
import { useReading } from '../features/reading/useReading';
import { configuredProviders } from '../features/settings/ModelSection';
import { defaultDensity, usePreferences } from '../features/settings/preferences';
import { useSettings } from '../features/settings/store';

type Loaded =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; saved: SavedChart; chart: ChartData };

function useChart(chartId: string | undefined): Loaded {
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
  }, [chartId]);

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

type ReadyProps = { saved: SavedChart; chart: ChartData; fresh: boolean };

function ChartView({ saved, chart, fresh }: ReadyProps) {
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
  const reading = useReading({ saved, chart, selectedPalace: selected, provider });
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
    />
  );

  const detail = (headingId: string) =>
    palace && (
      <PalaceDetail
        chart={chart}
        palace={palace}
        onClose={() => selectPalace(null)}
        headingId={headingId}
        onInterpret={canInterpret ? () => interpret(palace.name) : undefined}
      />
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
      <section aria-labelledby="chart-title" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h1 id="chart-title" className="text-[1.5rem] md:text-[2rem]">
            {saved.input.name}的命盤
          </h1>
          <DensityControl value={density} onChange={setDensity} />
        </div>
        <div className="mx-auto w-full max-w-[720px]">
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
          />
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          點宮位或用方向鍵移動、按 Enter，查看完整星曜與三方四正。
        </p>
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
          className="palace-sheet fixed inset-x-0 bottom-0 z-20 max-h-[58dvh] overflow-y-auto rounded-t-sheet border-t border-line bg-bg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 lg:hidden"
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
  const loaded = useChart(chartId);

  // 從表單排出來的那一次才播放落位動畫；重新整理或從清單開啟不播。
  const fresh = (location.state as { fresh?: boolean } | null)?.fresh === true;

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
  return <ChartView key={loaded.saved.id} saved={loaded.saved} chart={loaded.chart} fresh={fresh} />;
}
