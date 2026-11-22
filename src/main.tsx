import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import './styles/index.css';

import { AppShell } from './components/AppShell';
import { reloadForStaleChunks, retryAfterReload } from './components/UpdateBanner';
import { applyTheme, useSettings } from './features/settings/store';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';

// hash 路由：GitHub Pages 沒有 SPA 回退，而且 # 之後的內容不會送到伺服器。
// 首頁以外的頁面用到時才載入。
const router = createHashRouter([
  {
    element: <AppShell />,
    hydrateFallbackElement: <p className="p-6 text-ink-muted">讀取中</p>,
    children: [
      { index: true, element: <Home /> },
      { path: 'chart/:chartId', lazy: () => import('./pages/Chart').then((module) => ({ Component: module.Chart })) },
      { path: 'months/:chartId', lazy: () => import('./pages/Months').then((module) => ({ Component: module.Months })) },
      { path: 'rectify/:chartId', lazy: () => import('./pages/Rectify').then((module) => ({ Component: module.Rectify })) },
      { path: 'glossary/:term?', lazy: () => import('./pages/Glossary').then((module) => ({ Component: module.Glossary })) },
      { path: 'compare/:a?/:b?', lazy: () => import('./pages/Compare').then((module) => ({ Component: module.Compare })) },
      { path: 'import', lazy: () => import('./pages/Import').then((module) => ({ Component: module.Import })) },
      { path: 'charts', lazy: () => import('./pages/Charts').then((module) => ({ Component: module.Charts })) },
      { path: 'settings', lazy: () => import('./pages/Settings').then((module) => ({ Component: module.Settings })) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

// 佈景主題在畫面出現前就套用，之後跟著設定變動。
applyTheme(useSettings.getState().theme);
useSettings.subscribe((state) => applyTheme(state.theme));

const root = document.getElementById('root');
if (!root) throw new Error('找不到 #root');

// 新版部署後，舊分頁要延後載入的程式區塊（其他頁面、AI 用戶端、Markdown）已經不在伺服器上。
// Vite 載入失敗時會發出這個事件：直接重新載入換成最新版。
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForStaleChunks()) event.preventDefault();
});

// 剛按過「立即更新」但載到的還是舊版時，會換成帶版本參數的網址重載，這次就不必畫了。
if (!retryAfterReload()) {
  // 字型的 CSS 延後載入，不擋第一次繪製。
  void import('./fonts');

  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
