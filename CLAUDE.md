# CLAUDE.md

紫微斗數排盤與 AI 解讀網站。完整需求在 `HANDOFF.md`，動工前先讀；本檔是每次工作都要遵守的規則。兩者衝突時以 `HANDOFF.md` 為準並回報。

## 專案摘要

- Vite ＋ React ＋ TypeScript strict ＋ Tailwind，hash 路由。**純前端靜態網站，沒有後端**
- 部署在 GitHub Pages 的子路徑（`/<repo 名稱>/`），與業主的其他網站同網域（`HANDOFF.md` 第 7.8 節）
- 排盤用 `iztro`，在瀏覽器端計算
- 使用者自帶 OpenAI 或 Anthropic 金鑰；出生資料與金鑰只存在瀏覽器，提問時由瀏覽器直連供應商
- 解讀是多輪對話，支援追問（`HANDOFF.md` 第 6.5 節）
- 介面只有繁體中文（臺灣用語）

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

1. **AI 不排盤。** 星曜位置、四化、運限一律由 `features/chart/engine.ts` 計算。不要讓模型推算或修改命盤資料。
2. **資料留在本機。** 不寫任何伺服器端程式（含 serverless function），不接後端服務。出生資料、稱呼、金鑰不進網址；金鑰不進匯出檔、測試程式與 repo。
3. **只連兩個主機。** 對外請求只能到 `api.openai.com` 與 `api.anthropic.com`，並用 CSP 強制。不要為了繞過 CORS 加代理；遇到直連被擋，回報業主。
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

## 設計

- 方向、色彩、字體、版面見 `HANDOFF.md` 第 8 節；先交設計計畫再實作
- 顏色與間距一律用 design tokens，不寫死色值
- 全站唯一的紫色只給紫微星
- 四化標記同時有文字與顏色
- 手機優先，寬 360px 要可用
- 改完介面後截圖（桌機與手機）自我檢查

## 文案

- 按鈕寫實際會發生的事（「排出命盤」「測試連線」）
- 錯誤訊息說明發生什麼與怎麼處理
- 不用宿命或聳動字眼，不用 emoji 當圖示

## 工作方式

- 依 `HANDOFF.md` 第 11 節的里程碑推進，一次一個
- 每個里程碑結束：lint、typecheck、測試全過，附截圖，簡述做了什麼與未解問題
- 小步提交，提交訊息說明原因
- 需求不清楚時，先看 `HANDOFF.md` 第 12 節的預設；沒有涵蓋再問
- 發現 `HANDOFF.md` 的內容與官方文件不符時，以官方文件為準並回報

## 完成定義

- lint、typecheck、單元測試、E2E 通過
- 沒有金鑰時，除解讀外的功能都正常
- 建置產物是純靜態檔案；E2E 的資料不外流檢查通過
- 新增的排盤或序列化邏輯有測試
- Lighthouse 無障礙 90 以上
