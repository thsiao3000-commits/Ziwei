import { useEffect, useState } from 'react';

type Engine = typeof import('./engine');

let pending: Promise<Engine> | null = null;
let loaded: Engine | null = null;

/**
 * 延後載入排盤模組（iztro 很大）。首頁先畫出表單，排盤模組在背景載入；
 * 命盤頁等其他頁面本身就是延後載入的，直接 import engine 即可。
 */
export function loadEngine(): Promise<Engine> {
  pending ??= import('./engine').then((module) => {
    loaded = module;
    return module;
  });
  return pending;
}

/** 排盤模組載入完成前回傳 null。 */
export function useEngine(): Engine | null {
  const [engine, setEngine] = useState<Engine | null>(loaded);
  useEffect(() => {
    if (engine) return;
    let cancelled = false;
    void loadEngine().then((module) => {
      if (!cancelled) setEngine(module);
    });
    return () => {
      cancelled = true;
    };
  }, [engine]);
  return engine;
}
