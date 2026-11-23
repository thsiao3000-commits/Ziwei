import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** 列裡的按鈕數量：變動時重新判斷要不要淡出 */
  count: number;
  children: ReactNode;
};

/**
 * 一排按鈕（快捷提問、大限、流年、流月）。手機上左右滑動：還有按鈕在右邊時右緣淡出，
 * 捲到底（或根本不用捲）時標上 data-at-end 取消淡出。平板以上換行顯示，不淡出。
 * 樣式在 chart.css 的 .chip-row 與 .chip-fade。
 */
export function ChipRow({ count, className = '', children, ...rest }: Props) {
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
  return (
    <div ref={ref} className={`chip-row chip-fade ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
