import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * GitHub Pages 的專案站台路徑。repo 改名時只改這裡。
 */
const BASE = '/Ziwei/';

/**
 * GitHub Pages 不能自訂回應標頭，CSP 以 <meta> 下達（HANDOFF 第 7.8、9 節）。
 * 只在建置時注入：開發伺服器的熱更新需要行內腳本與 WebSocket，會被這份政策擋下。
 * 對外連線只允許兩家 AI 供應商；腳本、字型、圖片只允許本站。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'self' https://api.openai.com https://api.anthropic.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** 版本號的唯一來源是 package.json 的 version；畫面、匯出檔與新版偵測都用它。 */
const APP_VERSION = `v${(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version}`;

/**
 * 建置時輸出 version.json。已開著的分頁會不走快取抓它，發現線上版本比較新就提示更新
 *（瀏覽器，尤其手機上久開的分頁，可能一直顯示快取的舊頁面）。
 */
function versionFile(): Plugin {
  return {
    name: 'ziwei:version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ version: APP_VERSION })}\n` });
    },
  };
}

function cspMeta(): Plugin {
  return {
    name: 'ziwei:csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

/**
 * fontsource 的 CSS 同時列出 woff2 與 woff。本站支援的瀏覽器都能用 woff2，
 * 拿掉 woff 後備可以讓發佈的字型檔少一半。
 */
function woff2Only(): Plugin {
  return {
    name: 'ziwei:woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@fontsource') || !id.split('?')[0]?.endsWith('.css')) return null;
      return {
        code: code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, ''),
        map: null,
      };
    },
  };
}

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [woff2Only(), react(), tailwindcss(), cspMeta(), versionFile()],
  build: {
    // 行內 data: 資源會被 CSP 的 font-src / img-src 'self' 擋下，一律輸出成檔案。
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    // 排盤測試一次算十幾張盤，CI 的機器比較慢，預設的 5 秒不夠。
    testTimeout: 30_000,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
