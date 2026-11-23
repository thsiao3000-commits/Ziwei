import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** 列裡的按鈕數量：變動時重新判斷要不要淡出 */
  count: number;
  /** 目前選中的是哪一格（任何會跟著選取改變的值）：改變時把選中的那一格捲到看得見的位置 */
  activeKey?: string | number | null;
  children: ReactNode;
};

/**
 * 一排按鈕（快捷提問、大限、流年、流月）。手機上左右滑動：還有按鈕在右邊時右緣淡出，
 * 捲到底（或根本不用捲）時標上 data-at-end 取消淡出。平板以上換行顯示，不淡出。
 * 樣式在 chart.css 的 .chip-row 與 .chip-fade。
 */
/** 右緣淡出的寬度（和 chart.css 的 .chip-fade 一致）：選中的那一格落在這一段裡也算看不清楚。 */
const FADE_WIDTH = 48;

export function ChipRow({ count, activeKey, className = '', children, ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => el.toggleAttribute('data-at-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [count]);

  // 選中的那一格被切掉或落在淡出的範圍裡時，把它捲到列的中間。只動這一列，不捲動頁面；
  // 已經看得清楚就不動，免得按鈕在手指底下移位。
  useEffect(() => {
    const el = ref.current;
    const chip = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !chip || el.scrollWidth <= el.clientWidth) return;
    const left = chip.offsetLeft;
    const right = left + chip.offsetWidth;
    const atEnd = right >= el.scrollWidth - 2;
    const visibleRight = el.scrollLeft + el.clientWidth - (atEnd ? 0 : FADE_WIDTH);
    if (left >= el.scrollLeft && right <= visibleRight) return;
    el.scrollTo({ left: Math.max(0, left - (el.clientWidth - chip.offsetWidth) / 2) });
  }, [activeKey, count]);

  return (
    <div ref={ref} className={`chip-row chip-fade ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
