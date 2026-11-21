import { Link } from 'react-router';
import { findTerm } from './terms';

/** 可以點的名詞：辭典裡有這個詞才變成按鈕，沒有就維持原本的文字。 */
export function TermButton({ name, onPick, children }: { name: string; onPick: (name: string) => void; children?: React.ReactNode }) {
  if (!findTerm(name)) return <>{children ?? name}</>;
  return (
    <button type="button" className="term-button" onClick={() => onPick(name)}>
      {children ?? name}
      {/* 朗讀名稱要包含畫面上的文字，所以用附加的隱藏文字，不用 aria-label 蓋掉。 */}
      <span className="sr-only">（看名詞說明）</span>
    </button>
  );
}

/** 名詞說明：點了盤上的名詞後，就地顯示白話解釋。 */
export function TermNote({ name, onClose }: { name: string; onClose: () => void }) {
  const entry = findTerm(name);
  if (!entry) return null;
  return (
    <div role="note" aria-live="polite" className="mt-3 max-w-[34em] border border-line-soft bg-surface px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <p className="font-kai text-[1.0625rem] font-bold">
          {entry.term}
          {name !== entry.term && <span className="ml-2 font-serif text-sm font-normal text-ink-muted">（{name}）</span>}
        </p>
        <button type="button" onClick={onClose} className="shrink-0 rounded-control border border-line px-2 font-kai text-sm">
          收起說明
        </button>
      </div>
      <p className="mt-1">{entry.text}</p>
      <p className="mt-1 text-sm">
        <Link to={`/glossary/${encodeURIComponent(entry.term)}`} className="text-accent underline underline-offset-4">
          在名詞小辭典看更多
        </Link>
      </p>
    </div>
  );
}
