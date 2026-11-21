export function Settings() {
  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title" className="text-[1.75rem] md:text-[2.25rem]">
        設定
      </h1>
      <p className="mt-4 max-w-[34em]">
        AI 供應商與金鑰、模型、排盤選項、外觀與資料的設定會放在這裡，目前尚未開放。
      </p>
      <p className="mt-4 max-w-[34em] text-ink-muted">
        金鑰只存在這台裝置的瀏覽器，本站沒有伺服器會收到它。
      </p>
    </section>
  );
}
