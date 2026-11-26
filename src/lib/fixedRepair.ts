import { useEffect } from 'react';

/**
 * iOS 的 Safari 在旋轉螢幕之後，有時不會重新計算固定在畫面底部的元素（底部導覽列、提問輸入列）：
 * 它們會停在螢幕中間、蓋住內容，要等使用者捲動才歸位（業主在 iPhone Duo 上回報，v1.17.1；
 * WebKit bug 144913 的症狀與做法相同）。這裡在旋轉或寬度改變之後，替使用者把頁面捲 1px 再捲回來，
 * 讓瀏覽器重新排版。只在觸控裝置上做；電腦沒有這個問題。
 */
const DELAYS = [150, 500, 1000] as const;

function nudge() {
  const y = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return;
  const moved = y >= max ? y - 1 : y + 1;
  window.scrollTo(window.scrollX, moved);
  requestAnimationFrame(() => {
    // 使用者這時剛好在捲動就不拉回去，免得畫面跳一下。
    if (Math.abs(window.scrollY - moved) < 1) window.scrollTo(window.scrollX, y);
  });
}

export function useFixedRepair() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    let timers: number[] = [];
    let width = window.innerWidth;

    const repair = () => {
      for (const timer of timers) window.clearTimeout(timer);
      // 旋轉的動畫要一點時間，而且瀏覽器更新畫面大小的時機不固定：隔幾段時間各做一次。
      timers = DELAYS.map((delay) => window.setTimeout(nudge, delay));
    };
    // 捲動時 Safari 收起網址列也會觸發 resize，但那時寬度不變；只有寬度變了（旋轉、摺疊或展開）才處理。
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      repair();
    };

    window.addEventListener('orientationchange', repair);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('orientationchange', repair);
      window.removeEventListener('resize', onResize);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);
}
