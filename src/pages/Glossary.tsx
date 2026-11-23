import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { CATEGORIES, findTerm, searchTerms, TERMS } from '../features/glossary/terms';

/** 名詞小辭典：紫微斗數常見名詞的白話說明，可搜尋。 */
export function Glossary() {
  const { term } = useParams();
  const target = term ? findTerm(term) : undefined;
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchTerms(query), [query]);

  // 從命盤頁點「在名詞小辭典看更多」進來時，捲到那一條。
  useEffect(() => {
    if (!target) return;
    document.getElementById(`term-${target.term}`)?.scrollIntoView({ block: 'center' });
  }, [target]);

  return (
    <section aria-labelledby="glossary-title" className="max-w-[60rem] xl:max-w-none">
      <h1 id="glossary-title" className="text-[1.75rem] md:text-[2.25rem]">
        名詞小辭典
      </h1>
      <p className="mt-3 max-w-[34em]">
        紫微斗數常見名詞的白話說明，共 {TERMS.length} 條。這裡寫的是一般通行的看法，各流派的細節可能不同；它描述的是傾向，不是定論。
      </p>

      <div className="mt-5 max-w-[28rem]">
        <label htmlFor="glossary-search" className="font-kai text-[1.0625rem] font-bold">
          搜尋名詞
        </label>
        <input
          id="glossary-search"
          type="search"
          className="mt-1 w-full rounded-control border border-line bg-bg px-3 py-2 text-base text-ink"
          value={query}
          placeholder="例如：化忌、三方四正、紫微"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        <p aria-live="polite" className="mt-1 text-sm text-ink-muted">
          {query.trim() ? `找到 ${results.length} 條` : '輸入關鍵字可以篩選；也可以直接往下瀏覽。'}
        </p>
      </div>

      {results.length === 0 && (
        <p className="mt-6 max-w-[34em]">沒有符合「{query.trim()}」的名詞。試試比較短的關鍵字，例如只輸入星名的前兩個字。</p>
      )}

      {CATEGORIES.map((category) => {
        const items = results.filter((item) => item.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} aria-labelledby={`category-${category}`} className="mt-8">
            <h2 id={`category-${category}`} className="border-b border-line pb-1 text-[1.375rem]">
              {category}
            </h2>
            <dl className="mt-2 xl:grid xl:grid-cols-2 xl:gap-x-12 3xl:grid-cols-3">
              {items.map((item) => (
                <div
                  key={item.term}
                  id={`term-${item.term}`}
                  className={`border-b border-line-soft py-3 md:grid md:grid-cols-[9rem_1fr] md:gap-x-6 ${
                    target?.term === item.term ? 'bg-surface px-2' : ''
                  }`}
                >
                  <dt className="font-kai text-[1.125rem] font-bold">
                    {item.term}
                    {item.aliases && item.aliases.length > 0 && (
                      <span className="block font-serif text-sm font-normal text-ink-muted">{item.aliases.slice(0, 6).join('、')}</span>
                    )}
                  </dt>
                  <dd className="mt-1 max-w-[34em] md:mt-0">{item.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </section>
  );
}
