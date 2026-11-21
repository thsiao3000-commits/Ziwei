import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

// 字型自行託管（不發出第三方請求）。分片依 unicode-range 按需載入。
import '@fontsource/lxgw-wenkai-tc/400.css';
import '@fontsource/lxgw-wenkai-tc/700.css';
import '@fontsource/noto-serif-tc/400.css';
import '@fontsource/noto-serif-tc/700.css';
import './styles/index.css';

import { AppShell } from './components/AppShell';
import { applyTheme, useSettings } from './features/settings/store';
import { Chart } from './pages/Chart';
import { Charts } from './pages/Charts';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';
import { Settings } from './pages/Settings';

// hash 路由：GitHub Pages 沒有 SPA 回退，而且 # 之後的內容不會送到伺服器。
const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'chart/:chartId', element: <Chart /> },
      { path: 'charts', element: <Charts /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

// 佈景主題在畫面出現前就套用，之後跟著設定變動。
applyTheme(useSettings.getState().theme);
useSettings.subscribe((state) => applyTheme(state.theme));

const root = document.getElementById('root');
if (!root) throw new Error('找不到 #root');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
