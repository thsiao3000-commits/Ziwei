import { Link } from 'react-router';

export function Charts() {
  return (
    <section aria-labelledby="charts-title">
      <h1 id="charts-title" className="text-[1.75rem] md:text-[2.25rem]">
        我的命盤
      </h1>
      <p className="mt-4 max-w-[34em]">還沒有命盤。輸入出生資料，排出第一張。</p>
      <p className="mt-4">
        <Link to="/" className="text-accent underline underline-offset-4">
          前往排盤
        </Link>
      </p>
    </section>
  );
}
