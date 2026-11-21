// 字型自行託管（不發出第三方請求）。分片依 unicode-range 按需載入。
// 這個模組由 main.tsx 延後載入：四個字重各有一百多條 @font-face 規則，
// 放在主要的 CSS 裡會拖慢第一次繪製。字型本來就是 font-display: swap。
import '@fontsource/lxgw-wenkai-tc/400.css';
import '@fontsource/lxgw-wenkai-tc/700.css';
import '@fontsource/noto-serif-tc/400.css';
import '@fontsource/noto-serif-tc/700.css';
