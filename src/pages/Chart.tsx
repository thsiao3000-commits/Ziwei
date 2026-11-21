import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { CentreInfo } from '../features/chart/CentreInfo';
import { ChartBoard } from '../features/chart/ChartBoard';
import { DensityControl } from '../features/chart/DensityControl';
import { computeChart } from '../features/chart/engine';
import { PalaceDetail } from '../features/chart/PalaceDetail';
import { getChart } from '../features/chart/store';
import type { ChartData, SavedChart } from '../features/chart/types';
import { defaultDensity, usePreferences } from '../features/settings/preferences';

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

export function Chart() {
  const { chartId } = useParams();
  const location = useLocation();
  const loaded = useChart(chartId);
  const [selected, setSelected] = useState<number | null>(null);
  const stored = usePreferences((state) => state.density);
  const setDensity = usePreferences((state) => state.setDensity);
  const [fallback] = useState(defaultDensity);
  const density = stored ?? fallback;

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

  const { chart, saved } = loaded;
  const palace = selected === null ? undefined : chart.palaces[selected];

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
            onSelect={setSelected}
            animate={fresh}
            label={`${saved.input.name}的命盤`}
            centre={<CentreInfo chart={chart} name={saved.input.name} />}
          />
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          點宮位或用方向鍵移動、按 Enter，查看完整星曜與三方四正。
        </p>
      </section>

      {/* 桌機：側欄 */}
      <aside aria-label="宮位詳情與解讀" className="hidden min-w-0 border-l border-line pl-10 lg:block">
        {palace ? (
          <PalaceDetail chart={chart} palace={palace} onClose={() => setSelected(null)} headingId="palace-detail-side" />
        ) : (
          <div className="max-w-[34em]">
            <h2 className="text-[1.5rem]">解讀</h2>
            <p className="mt-3">點左邊任一宮位，這裡會顯示該宮的完整星曜、三方四正與宮干飛化。</p>
            <p className="mt-3 text-ink-muted">AI 解讀尚未開放。命盤本身已可完整使用。</p>
          </div>
        )}
      </aside>

      {/* 手機：底部抽屜。不擋住命盤，仍可繼續點其他宮位。 */}
      {palace && (
        <div
          role="dialog"
          aria-labelledby="palace-detail-sheet"
          className="palace-sheet fixed inset-x-0 bottom-0 z-20 max-h-[58dvh] overflow-y-auto rounded-t-sheet border-t border-line bg-bg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 lg:hidden"
        >
          <PalaceDetail chart={chart} palace={palace} onClose={() => setSelected(null)} headingId="palace-detail-sheet" />
        </div>
      )}
    </div>
  );
}
