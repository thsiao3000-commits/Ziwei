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
  plugins: [woff2Only(), react(), tailwindcss(), cspMeta()],
  build: {
    // 行內 data: 資源會被 CSP 的 font-src / img-src 'self' 擋下，一律輸出成檔案。
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
