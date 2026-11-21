import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_PREFIX, prefixed } from '../src/lib/storage/keys';
import { clearSiteData, readItem, removeItem, writeItem } from '../src/lib/storage/local';

// 同網域的投資組合網站實際使用的鍵名前綴。
const NEIGHBOUR_KEYS = {
  twbt_apikey: 'not-a-real-key',
  twpf_v1: '{"holdings":[]}',
  twbt_model: 'some-model',
};

beforeEach(() => {
  for (const store of [localStorage, sessionStorage]) {
    for (const key of Object.keys(store)) store.removeItem(key);
  }
});

describe('儲存前綴', () => {
  it('寫入的鍵一律帶 ziwei: 前綴', () => {
    writeItem('settings', '{}');
    expect(localStorage.getItem('ziwei:settings')).toBe('{}');
    expect(localStorage.getItem('settings')).toBeNull();
  });

  it('已有前綴的鍵不會重複加', () => {
    expect(prefixed('ziwei:settings')).toBe('ziwei:settings');
    expect(prefixed('settings')).toBe(`${STORAGE_PREFIX}settings`);
  });

  it('讀不到其他前綴的資料', () => {
    localStorage.setItem('twbt_apikey', NEIGHBOUR_KEYS.twbt_apikey);
    expect(readItem('twbt_apikey')).toBeNull();
  });

  it('local 與 session 分開存', () => {
    writeItem('key', 'a', 'local');
    writeItem('key', 'b', 'session');
    expect(readItem('key', 'local')).toBe('a');
    expect(readItem('key', 'session')).toBe('b');
    removeItem('key', 'session');
    expect(readItem('key', 'session')).toBeNull();
    expect(readItem('key', 'local')).toBe('a');
  });
});

describe('清除本站所有資料', () => {
  it('只刪本站前綴的鍵，其他前綴原封不動', async () => {
    for (const [key, value] of Object.entries(NEIGHBOUR_KEYS)) {
      localStorage.setItem(key, value);
      sessionStorage.setItem(key, value);
    }
    writeItem('settings', '{"theme":"dark"}');
    writeItem('conversations', '[]');
    writeItem('session-key', 'x', 'session');

    await clearSiteData();

    expect(readItem('settings')).toBeNull();
    expect(readItem('conversations')).toBeNull();
    expect(readItem('session-key', 'session')).toBeNull();
    for (const [key, value] of Object.entries(NEIGHBOUR_KEYS)) {
      expect(localStorage.getItem(key)).toBe(value);
      expect(sessionStorage.getItem(key)).toBe(value);
    }
    expect(localStorage.length).toBe(Object.keys(NEIGHBOUR_KEYS).length);
  });

  it('前綴相近但不相同的鍵不會被誤刪', async () => {
    localStorage.setItem('ziwei', 'keep');
    localStorage.setItem('ziweidata', 'keep');
    localStorage.setItem('ziwei:mine', 'drop');

    await clearSiteData();

    expect(localStorage.getItem('ziwei')).toBe('keep');
    expect(localStorage.getItem('ziweidata')).toBe('keep');
    expect(localStorage.getItem('ziwei:mine')).toBeNull();
  });
});
