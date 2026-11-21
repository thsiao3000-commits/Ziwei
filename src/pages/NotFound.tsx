import { Link } from 'react-router';

export function NotFound() {
  return (
    <section aria-labelledby="notfound-title">
      <h1 id="notfound-title" className="text-[1.75rem] md:text-[2.25rem]">
        找不到這個頁面
      </h1>
      <p className="mt-4 max-w-[34em]">網址可能打錯了，或這張命盤已經從這台裝置刪除。</p>
      <p className="mt-4">
        <Link to="/" className="text-accent underline underline-offset-4">
          回到排盤
        </Link>
      </p>
    </section>
  );
}
