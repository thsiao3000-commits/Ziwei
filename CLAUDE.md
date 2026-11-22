# CLAUDE.md

紫微斗數排盤與 AI 解讀網站。完整需求在 `HANDOFF.md`，動工前先讀；本檔是每次工作都要遵守的規則。兩者衝突時以 `HANDOFF.md` 為準並回報。

## 專案摘要

- Vite ＋ React ＋ TypeScript strict ＋ Tailwind，hash 路由。**純前端靜態網站，沒有後端**
- 部署在 GitHub Pages 的子路徑（`/<repo 名稱>/`），與業主的其他網站同網域（`HANDOFF.md` 第 7.8 節）
- 排盤用 `iztro`，在瀏覽器端計算
- 使用者自帶 OpenAI 或 Anthropic 金鑰；出生資料與金鑰只存在瀏覽器，提問時由瀏覽器直連供應商
- 解讀是多輪對話，支援追問（`HANDOFF.md` 第 6.5 節）
- 介面只有繁體中文（臺灣用語）
- 進度：`HANDOFF.md` 第 11 節的 M0–M5 已完成並部署；「之後」的項目也全部完成（定盤輔助、匯出、名詞小辭典、合盤、截圖匯入），第 2 節的 CR-01 到 CR-17 都做完了

## 指令

專案建立後把實際指令填在這裡，並保持更新：

```
pnpm dev          # 開發伺服器
pnpm lint
pnpm typecheck
pnpm test         # Vitest
pnpm test:e2e     # Playwright：先建置，再以 /Ziwei/ 子路徑預覽後測試（第一次先跑 pnpm exec playwright install chromium）
pnpm build        # tsc -b && vite build，產出 dist/
pnpm preview      # 以 /Ziwei/ 子路徑預覽 dist/
```

- CSP 只在建置時注入（`vite.config.ts`），所以 CSP 相關行為要用 `pnpm test:e2e` 或 `pnpm preview` 驗證，`pnpm dev` 看不到
- TypeScript 釘在 6.0.x：`typescript-eslint` 尚未支援 7

## 不可違反的規則

1. **AI 不排盤。** 星曜位置、四化、運限一律由 `features/chart/engine.ts` 計算。不要讓模型推算或修改命盤資料。截圖匯入也一樣：模型只讀出圖上印的出生資料給使用者核對，圖上的星曜不匯入。
2. **資料留在本機。** 不寫任何伺服器端程式（含 serverless function），不接後端服務。出生資料、稱呼、金鑰不進網址；金鑰不進匯出檔、測試程式與 repo。
3. **只連兩個主機。** 對外請求只能到 `api.openai.com` 與 `api.anthropic.com`，並用 CSP 強制。不要為了繞過 CORS 加代理；遇到直連被擋，回報業主。同網域的 `/BenchAI-Support/pricing.json`（業主自己的模型價格表）是同源請求，不算對外；一律用同源路徑去抓，不要寫成完整網址。
4. **不憑記憶寫 API。** 模型 ID、SDK 版本、請求參數都先對照官方文件或套件型別定義（`HANDOFF.md` 第 13 節）。
5. **Markdown 不渲染原始 HTML。**
6. **只有 `engine.ts` 可以 import `iztro`。** 日期用字串傳遞，不經過 `Date`。
7. **不發出第三方請求。** 不加分析、廣告、錯誤回報服務；字型自行託管。
8. **儲存要加前綴。** localStorage 與 sessionStorage 鍵一律以 `ziwei:` 開頭，IndexedDB 用 `ziwei-db`。禁止 `localStorage.clear()`，不碰其他前綴的資料。
9. **子路徑要能用。** 不寫死以 `/` 開頭的資源路徑；repo 是公開的，不放金鑰與真實出生資料。

## 模型支援

- 推薦清單集中在 `lib/llm/models.config.ts`，不要把模型 ID 散落在元件裡
- 下拉選單來源：動態列表 → 推薦清單後備 → 使用者自訂 ID
- 預設不送思考或取樣參數；參數被拒時移除後重試一次
- 用官方 SDK（`@anthropic-ai/sdk`、`openai`）的瀏覽器模式，用到時才載入；測試用真的 SDK、只換掉 `fetch`

## 送給模型的資料

- 命盤內容與四柱干支一律送出；稱呼、國曆與農曆生日、時辰要使用者開啟「提問時附上出生年月日」才送
- 截圖匯入會把整張圖（含圖上的姓名與生日）送給供應商：一定要使用者按下按鈕才送，按之前要寫明送什麼、送給誰。圖片不存本機，預覽用 canvas（CSP 的 `img-src` 只允許本站，不能用 `blob:` 或 `data:` 的 `<img>`）
- 改動 `features/reading/serialize.ts` 時，同步更新介面上「會送出什麼」的說明與快照測試
- 合盤（`features/compare/`）：兩盤的交互關係由程式計算後才交給模型；對話的 `chartId` 是 `compare:<甲>:<乙>`，凡是依 `chartId` 處理對話的地方（刪除命盤、備份）都要顧到這種鍵
- 命盤的畫面（`ChartBoard.tsx`）與匯出圖（`exportImage.ts`，canvas）是兩套繪製：改了其中一邊顯示的內容，另一邊要跟著改

## 設計

- 方向、色彩、字體、版面見 `HANDOFF.md` 第 8 節；先交設計計畫再實作
- 顏色與間距一律用 design tokens，不寫死色值
- 全站唯一的紫色只給紫微星
- 四化標記同時有文字與顏色
- 手機優先，寬 360px 要可用
- 表單欄位（`select`、`input`、`textarea`）字級不可小於 16px：iPhone 的 Safari 會自動放大整頁
- 固定在手機底部的元素要用 `--bottom-nav-height`（含 iPhone 的安全區），不要寫死像素
- 電腦版內容靠左、最寬 1800px（和業主的 Stock 網站一致），不要把內容置中在窄欄裡
- 改完介面後截圖（桌機與手機）自我檢查
- 任何可橫向捲動的容器（`.chip-row`、`overflow-x-auto` 的表格外框）都要有寬度限制，並加上 `position: relative`：裡面給報讀器用的 `sr-only` 是絕對定位，沒有定位基準就會跑出容器、把手機頁面撐寬。可捲動的區域還要 `tabIndex={0}` 與標籤。手機頁面不可水平溢出（E2E 有檢查）

## 文案

- 按鈕寫實際會發生的事（「排出命盤」「測試連線」）
- 設定頁的新手使用指南（`features/settings/GuideSection.tsx`）引用了按鈕與欄位名稱：改介面文字或新增主要功能時同步更新
- 錯誤訊息說明發生什麼與怎麼處理
- 不用宿命或聳動字眼，不用 emoji 當圖示
- 名詞小辭典（`features/glossary/terms.ts`）：盤上會出現的宮名與星曜都要有條目（有測試檢查）；說明寫「傳統上怎麼看」，不寫成定論

## 工作方式

- 依 `HANDOFF.md` 第 11 節的里程碑推進，一次一個
- 每個里程碑結束：lint、typecheck、測試全過，附截圖，簡述做了什麼與未解問題
- 小步提交，提交訊息說明原因
- 需求不清楚時，先看 `HANDOFF.md` 第 12 節的預設；沒有涵蓋再問
- 發現 `HANDOFF.md` 的內容與官方文件不符時，以官方文件為準並回報

## 版本

- 版本號的唯一來源是 `package.json` 的 `version`；畫面、`version.json`、匯出檔都由它產生
- 會讓使用者看到差異的修改都要升版：改 `package.json`、在 `CHANGELOG.md` 最上面加版本區塊、改 `README.md` 開頭的「版本：」。規則與步驟見 `CHANGELOG.md`
- 不升版的話，已經開著舊版的分頁不會收到「有新版」的提示

## 完成定義

- lint、typecheck、單元測試、E2E 通過
- 沒有金鑰時，除解讀外的功能都正常
- 建置產物是純靜態檔案；E2E 的資料不外流檢查通過
- 新增的排盤或序列化邏輯有測試
- Lighthouse 無障礙 90 以上
