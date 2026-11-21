import { NavLink, Outlet } from 'react-router';
import { APP_VERSION } from '../lib/version';
import { UpdateBanner } from './UpdateBanner';

const NAV = [
  { to: '/', label: '排盤', end: true },
  { to: '/charts', label: '我的命盤', end: false },
  { to: '/glossary', label: '名詞', end: false },
  { to: '/settings', label: '設定', end: false },
] as const;

function navClass({ isActive }: { isActive: boolean }): string {
  const base =
    'font-kai rounded-control px-3 py-2 text-[1.0625rem] leading-none underline-offset-[0.5em] decoration-2';
  return isActive ? `${base} text-ink underline decoration-line` : `${base} text-ink-muted hover:text-ink`;
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:rounded-control focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink"
      >
        跳到主要內容
      </a>

      <header className="border-b border-line">
        <div className="flex w-full max-w-[1800px] items-center gap-x-10 px-4 py-3 md:px-5">
          <div className="flex items-baseline gap-2">
            <NavLink to="/" className="font-kai text-[1.5rem] font-bold leading-none text-ink">
              紫微命盤
            </NavLink>
            <span className="text-sm leading-none text-ink-muted" data-testid="app-version">
              {APP_VERSION}
            </span>
          </div>
          <nav aria-label="主要導覽" className="hidden gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <UpdateBanner />

      <main id="main" className="w-full max-w-[1800px] flex-1 px-4 py-6 md:px-5 md:py-8">
        <Outlet />
      </main>

      <footer className="w-full max-w-[1800px] px-4 pb-[calc(var(--bottom-nav-height)+1.5rem)] pt-6 text-sm text-ink-muted md:px-5 md:pb-8">
        <p className="max-w-[34em]">
          紫微斗數解讀僅供自我了解與參考，不能取代醫療、法律或財務專業意見。
        </p>
        <p className="mt-1">紫微命盤 {APP_VERSION}</p>
      </footer>

      {/* 手機用底部導覽列 */}
      <nav
        aria-label="主要導覽"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[var(--bottom-nav-height)] items-stretch border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `font-kai flex flex-1 items-center justify-center text-center text-base leading-none ${
                isActive ? 'text-ink underline decoration-line decoration-2 underline-offset-[0.5em]' : 'text-ink-muted'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
