// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, compareVersions, parseVersionFile } from '../src/lib/version';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const packageVersion = `v${(JSON.parse(read('package.json')) as { version: string }).version}`;

describe('版本號', () => {
  it('畫面上的版本來自 package.json', () => {
    expect(APP_VERSION).toBe(packageVersion);
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('CHANGELOG 最上面的版本區塊與 package.json 一致，而且有日期', () => {
    const first = /^## \[(v\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})$/m.exec(read('CHANGELOG.md'));
    expect(first?.[1]).toBe(packageVersion);
    expect(first?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('README 開頭的版本與 package.json 一致', () => {
    expect(read('README.md')).toContain(`版本：${packageVersion}`);
  });

  it('CHANGELOG 的版本由新到舊，沒有重複', () => {
    const versions = [...read('CHANGELOG.md').matchAll(/^## \[(v\d+\.\d+\.\d+)\]/gm)].map((match) => match[1]!);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < versions.length; i += 1) {
      expect(compareVersions(versions[i - 1], versions[i])).toBeGreaterThan(0);
    }
  });
});

describe('比較版本', () => {
  it('較新為正、較舊為負、相同為 0', () => {
    expect(compareVersions('v2.6.0', 'v2.5.0')).toBeGreaterThan(0);
    expect(compareVersions('v2.5.0', 'v2.6.0')).toBeLessThan(0);
    expect(compareVersions('v2.5.0', 'v2.5.0')).toBe(0);
  });

  it('以數字比較而不是字串', () => {
    expect(compareVersions('v2.10.0', 'v2.9.0')).toBeGreaterThan(0);
    expect(compareVersions('v10.0.0', 'v9.9.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.1', 'v1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', 'v1.2.3')).toBe(0);
  });

  it('格式不對的當成 0.0.0，不會誤報有新版', () => {
    expect(compareVersions('abc', 'v1.0.0')).toBeLessThan(0);
    expect(compareVersions(null, 'v0.0.1')).toBeLessThan(0);
    expect(compareVersions(undefined, undefined)).toBe(0);
    expect(compareVersions('v1.2', 'v1.0.0')).toBeLessThan(0);
  });
});

describe('讀 version.json', () => {
  it('讀得出版本', () => {
    expect(parseVersionFile('{"version":"v12.3.45"}\n')).toBe('v12.3.45');
  });

  it('格式不對時回傳 null', () => {
    for (const text of ['', 'not json', '{}', '{"version":"1.2.3"}', '{"version":123}', '<html></html>', 'null']) {
      expect(parseVersionFile(text)).toBeNull();
    }
  });
});
