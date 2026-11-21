import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import './styles/index.css';

import { AppShell } from './components/AppShell';
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
      { path: 'rectify/:chartId', lazy: () => import('./pages/Rectify').then((module) => ({ Component: module.Rectify })) },
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

// 字型的 CSS 延後載入，不擋第一次繪製。
void import('./fonts');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
