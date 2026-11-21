declare const __APP_VERSION__: string;

/** 目前載入的版本，例如 v1.0.0。來源是 package.json 的 version（建置時注入）。 */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'v0.0.0';

/** 比較版本：大於 0 表示 a 較新。格式不對的一律當成 0.0.0，不會誤報有新版。 */
export function compareVersions(a: unknown, b: unknown): number {
  const parse = (value: unknown): [number, number, number] => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? '').trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
  };
  const x = parse(a);
  const y = parse(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** 從 version.json 的內容讀出版本；格式不對時回傳 null。 */
export function parseVersionFile(text: string): string | null {
  try {
    const data: unknown = JSON.parse(text);
    const version = (data as { version?: unknown } | null)?.version;
    return typeof version === 'string' && /^v\d+\.\d+\.\d+$/.test(version) ? version : null;
  } catch {
    return null;
  }
}
