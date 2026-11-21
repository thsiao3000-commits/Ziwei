import { BranchGrid } from '../components/BranchGrid';

export function Home() {
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-12">
      <section aria-labelledby="home-title">
        <h1 id="home-title" className="text-[1.75rem] md:text-[2.25rem]">
          排出命盤
        </h1>
        <p className="mt-4 max-w-[34em]">
          輸入出生的年月日與時辰，排出紫微斗數命盤。星曜位置、四化與運限都由排盤程式計算，AI
          只負責依這張盤回答問題。
        </p>
        <p className="mt-4 max-w-[34em] border-l-2 border-line pl-4">
          網站建置中：排盤表單尚未開放，目前只有版面。
        </p>
        <p className="mt-4 max-w-[34em] text-ink-muted">
          資料只存在這台裝置。提問時，命盤內容會由你的瀏覽器直接送給你選的 AI
          供應商，並依該供應商的政策處理。
        </p>
      </section>

      <div className="mx-auto w-full max-w-[560px]">
        <BranchGrid centre="排盤後，命盤會顯示在這裡" />
      </div>
    </div>
  );
}
