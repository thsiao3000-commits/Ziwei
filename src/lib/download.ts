/** 把瀏覽器裡產生的內容存成檔案。不經過任何伺服器。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // 留一點時間讓下載開始，再釋放。
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 檔名裡不能用的字元（路徑符號、控制字元）換成底線，並限制長度。 */
export function safeFilename(text: string, fallback: string): string {
  const cleaned = [...text]
    .map((char) => ('\\/:*?"<>|'.includes(char) || char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return cleaned || fallback;
}
