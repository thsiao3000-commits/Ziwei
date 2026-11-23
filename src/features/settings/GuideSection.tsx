import type { ReactNode } from 'react';
import { Link } from 'react-router';

const link = 'text-accent underline underline-offset-4';

/** 第一次使用的步驟。按鈕與欄位名稱要和畫面上的一致（E2E 有檢查連結）。 */
const STEPS: readonly { title: string; body: ReactNode }[] = [
  {
    title: '排出命盤',
    body: (
      <>
        到<Link to="/" className={link}>排盤</Link>
        填性別、出生日期（國曆或農曆）與出生時間，按「排出命盤」。這一步不需要金鑰，也不會送出任何資料。已經有別處排好的命盤圖片，可以用
        <Link to="/import" className={link}>從命盤截圖帶入</Link>（需要金鑰）。
      </>
    ),
  },
  {
    title: '看懂命盤',
    body: (
      <>
        點任何一宮，會標出它的三方四正並列出宮裡所有星曜。看不懂的名詞可以直接點，或到
        <Link to="/glossary" className={link}>名詞</Link>
        查。盤下方可以選大限、流年、流月，把運限疊在本命盤上。
      </>
    ),
  },
  {
    title: '取得並貼上 API 金鑰',
    body: (
      <>
        請 AI 解讀要用你自己的 OpenAI 或 Claude 金鑰，兩家擇一即可。在下面的「AI 供應商與金鑰」按「到…主控台取得金鑰」，在供應商網站建立金鑰並儲值，再回來貼上。費用由供應商直接向你收取，本站不經手。
      </>
    ),
  },
  {
    title: '測試連線，選模型',
    body: (
      <>
        貼上金鑰後按「測試連線」，確認金鑰可用。接著在「模型」選預設的供應商與模型；不確定就用清單裡標示推薦的。越強的模型通常越貴、越慢。
      </>
    ),
  },
  {
    title: '提問與追問',
    body: (
      <>
        回到命盤頁，按快捷提問（例如「命盤總論」「事業」「投資性格摘要」「今年流年」），或自己輸入問題。提問裡寫到西元年份，會自動附上那一年的大限與流年。回覆下方有建議的追問；選取回覆裡的一段文字，可以按「追問這段」。每則回覆會顯示
        token 用量與估算費用。
      </>
    ),
  },
  {
    title: '保存與其他功能',
    body: (
      <>
        排過的命盤與對話都存在
        <Link to="/charts" className={link}>我的命盤</Link>
        。命盤頁可以「下載命盤圖（PNG）」、匯出對話、比較相鄰時辰的命盤（不確定出生時辰時用）、看某一年的流月財運一覽，以及和另一張命盤合盤（含飛星互入與某一年的運限）。換裝置或清瀏覽器資料之前，先到本頁最下面的「外觀與資料」下載備份。
      </>
    ),
  },
];

/**
 * 把解讀結果貼到投資工具的步驟（業主的 Stock_TW）。
 * 引號裡的名稱要和命盤頁、流月財運一覽以及 Stock_TW 設定頁上的一致。
 */
const PASTE_STEPS: readonly ReactNode[] = [
  <>在命盤頁按快捷提問「投資性格摘要」，複製回覆最後「可貼上的摘要」那一段。</>,
  <>
    在命盤頁進「流月財運一覽」，選要看的年份，按「請 AI 判讀」。先拿回覆裡的國曆期間和頁面上的表格對一下，再複製回覆最後「可貼上的流月過濾」整個區塊。
  </>,
  <>
    打開 Stock_TW 的「設定」，找到「投資目標與風險偏好」。先寫你自己的狀況（投資目標、能承受的回撤、每月可再投入的金額），接著貼上摘要，最後貼上流月過濾。這一欄打字或貼上後會自動儲存。
  </>,
  <>回到 Stock_TW 請 AI 分析個股或投資組合，這一欄的內容會一併寫進提問。</>,
];

export function GuideSection({ defaultOpen }: { defaultOpen: boolean }) {
  return (
    <details open={defaultOpen} className="border-y border-line-soft py-3">
      <summary className="cursor-pointer font-kai text-[1.25rem] font-bold">新手使用指南</summary>
      <ol className="mt-4 grid max-w-[34em] gap-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
            <span aria-hidden="true" className="font-kai text-[1.125rem] font-bold text-ink-muted">
              {index + 1}
            </span>
            <div>
              <h3 className="font-kai text-[1.125rem] font-bold">
                <span className="sr-only">第 {index + 1} 步：</span>
                {step.title}
              </h3>
              <p className="mt-1">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 max-w-[34em]">
        <h3 className="font-kai text-[1.125rem] font-bold">把結果貼到 Stock_TW（選用）</h3>
        <p className="mt-1">
          Stock_TW 是本站作者另一個股票分析工具。想讓它的 AI 建議參考命盤顯示的理財傾向時，照下面做：
        </p>
        <ol data-testid="paste-steps" className="mt-2 grid list-decimal gap-1 pl-5">
          {PASTE_STEPS.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-ink-muted">
          <li>流月過濾只適用一個農曆年，換年要重新判讀，並把舊的那一段換掉。大限或流年換了，摘要也要重做。</li>
          <li>流月過濾是紫微斗數的傳統看法，沒有統計驗證。只拿來過濾加碼的時間，不要當成買進的理由；減碼與停損不受它限制。</li>
        </ul>
      </div>
      <div className="mt-5 max-w-[34em] border-l-2 border-line pl-3">
        <h3 className="font-kai text-[1.125rem] font-bold">先知道這幾件事</h3>
        <ul className="mt-1 grid list-disc gap-1 pl-5">
          <li>命盤由排盤程式計算，AI 只負責解讀，不會更動盤上的星曜。</li>
          <li>出生資料、命盤、對話與金鑰只存在這台裝置的瀏覽器裡。本站沒有帳號，也沒有伺服器會收到它們。</li>
          <li>提問時，命盤內容（含四柱干支）會由你的瀏覽器直接送給你選的供應商，並依該供應商的政策處理。稱呼與出生年月日預設不送，可以在「模型」裡開啟。</li>
          <li>金鑰等同付款憑證，不要貼給別人。用公用電腦時，把「記住金鑰的方式」改成「只記到關閉分頁」。</li>
          <li>紫微斗數各門派算法不同。和你手上的命盤對不上時，先看「排盤」裡的晚子時、年分界與安星法。</li>
          <li>解讀僅供自我了解與參考，不能取代醫療、法律或財務專業意見。</li>
        </ul>
      </div>
    </details>
  );
}
