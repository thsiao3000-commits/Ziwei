import { Link } from 'react-router';

export function Chart() {
  return (
    <section aria-labelledby="chart-title">
      <h1 id="chart-title" className="text-[1.75rem] md:text-[2.25rem]">
        命盤
      </h1>
      <p className="mt-4 max-w-[34em]">命盤頁尚未開放。</p>
      <p className="mt-4">
        <Link to="/" className="text-accent underline underline-offset-4">
          回到排盤
        </Link>
      </p>
    </section>
  );
}
