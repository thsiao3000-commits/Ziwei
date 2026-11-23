# 紫微命盤

版本：v1.10.0（變更紀錄見 `CHANGELOG.md`）

紫微斗數排盤與 AI 解讀網站。純前端靜態網站，沒有後端；出生資料、命盤、對話與 API 金鑰只存在使用者的瀏覽器。

- 網址：https://thsiao3000-commits.github.io/Ziwei/
- 需求：`HANDOFF.md`
- 開發規則：`CLAUDE.md`

## 開發

需要 Node 22.12 以上與 pnpm。

```
pnpm install
pnpm dev          # 開發伺服器
pnpm lint
pnpm typecheck
pnpm test         # Vitest
pnpm test:e2e     # Playwright（第一次先跑 pnpm exec playwright install chromium）
pnpm build        # 產出 dist/
pnpm preview      # 以 /Ziwei/ 子路徑預覽 dist/
```

推到 `main` 會由 GitHub Actions 檢查並發佈到 GitHub Pages。

## 進度

依 `HANDOFF.md` 第 11 節的里程碑推進。目前完成 M0（骨架、design tokens、字型、CI、部署）、M1（排盤表單、排盤模組、命盤元件、黃金測試）、M2（設定頁、金鑰本機儲存、LLM 用戶端、模型列表）、M3（解讀面板、命盤序列化、追問、對話保存）、M4（運限疊宮、排盤設定、解讀視角、我的命盤、花費統計）與 M5（無障礙、效能、E2E）。HANDOFF 第 11 節的 M0–M5 全部完成，另外完成定盤輔助（時辰對照）、匯出（命盤圖 PNG、對話 Markdown）、名詞小辭典、合盤與截圖匯入。
