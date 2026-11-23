import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteChart, saveChart } from '../src/features/chart/store';
import { createConversation, listConversations, saveConversation } from '../src/features/reading/store';
import { DEFAULT_CHART_SETTINGS } from '../src/features/chart/types';
import { BackupError, createBackup, parseBackup, restoreBackup } from '../src/features/settings/backup';
import { clearKey, getKey, maskKey, moveKeys, setKey } from '../src/features/settings/keys';
import { DEFAULT_SETTINGS, effectiveModel, useSettings } from '../src/features/settings/store';
import { getDB } from '../src/lib/storage/db';
import { clearSiteData } from '../src/lib/storage/local';

// 假字串，不是任何真實金鑰。
const FAKE_KEY = 'fake-key-for-tests-0000000000-abcd';

beforeEach(async () => {
  for (const store of [localStorage, sessionStorage]) {
    for (const key of Object.keys(store)) store.removeItem(key);
  }
  useSettings.setState({ ...DEFAULT_SETTINGS });
  await (await getDB()).clear('charts');
  await (await getDB()).clear('conversations');
});

describe('金鑰儲存', () => {
  it('遮罩只露出前 3 碼與後 4 碼', () => {
    expect(maskKey(FAKE_KEY)).toBe('fak••••••••abcd');
    expect(maskKey(FAKE_KEY)).not.toContain(FAKE_KEY.slice(3, -4));
    expect(maskKey('short')).toBe('••••••••');
  });

  it('預設記在這台裝置（localStorage），鍵名有 ziwei: 前綴', () => {
    expect(setKey('anthropic', `  ${FAKE_KEY}  `, 'local')).toBe(true);
    expect(localStorage.getItem('ziwei:key:anthropic')).toBe(FAKE_KEY);
    expect(sessionStorage.getItem('ziwei:key:anthropic')).toBeNull();
    expect(getKey('anthropic')).toBe(FAKE_KEY);
    expect(getKey('openai')).toBeNull();
  });

  it('只記到關閉分頁時存 sessionStorage，且不會留一份在 localStorage', () => {
    setKey('openai', FAKE_KEY, 'local');
    setKey('openai', FAKE_KEY, 'session');
    expect(sessionStorage.getItem('ziwei:key:openai')).toBe(FAKE_KEY);
    expect(localStorage.getItem('ziwei:key:openai')).toBeNull();
    expect(getKey('openai')).toBe(FAKE_KEY);
  });

  it('切換記住方式時搬移已存的金鑰', () => {
    setKey('openai', FAKE_KEY, 'local');
    moveKeys(['openai', 'anthropic'], 'session');
    expect(localStorage.getItem('ziwei:key:openai')).toBeNull();
    expect(sessionStorage.getItem('ziwei:key:openai')).toBe(FAKE_KEY);
    expect(getKey('anthropic')).toBeNull();
  });

  it('空白字串不會存', () => {
    expect(setKey('openai', '   ', 'local')).toBe(false);
    expect(getKey('openai')).toBeNull();
  });

  it('清除金鑰後兩個位置都沒有', () => {
    setKey('anthropic', FAKE_KEY, 'session');
    clearKey('anthropic');
    expect(getKey('anthropic')).toBeNull();
  });

  it('清除本站所有資料會清掉金鑰，但不動其他網站的鍵', async () => {
    localStorage.setItem('twbt_apikey', 'neighbour');
    setKey('anthropic', FAKE_KEY, 'local');
    await clearSiteData();
    expect(getKey('anthropic')).toBeNull();
    expect(localStorage.getItem('twbt_apikey')).toBe('neighbour');
  });
});

describe('設定', () => {
  it('有填自訂模型 ID 時優先使用', () => {
    expect(effectiveModel(DEFAULT_SETTINGS, 'anthropic')).toBe('claude-sonnet-5-5');
    expect(effectiveModel(DEFAULT_SETTINGS, 'openai')).toBe('gpt-6.2-sol');
    const custom = { ...DEFAULT_SETTINGS, customModel: { openai: '  gpt-next  ', anthropic: '', groq: '' } };
    expect(effectiveModel(DEFAULT_SETTINGS, 'groq')).toBe('openai/gpt-oss-120b');
    expect(effectiveModel(custom, 'openai')).toBe('gpt-next');
  });

  it('預設不送推理深度、不附出生年月日', () => {
    expect(DEFAULT_SETTINGS.effort).toBe('default');
    expect(DEFAULT_SETTINGS.includeBirthDate).toBe(false);
  });

  it('存到 localStorage 的設定不含金鑰', () => {
    setKey('openai', FAKE_KEY, 'local');
    useSettings.getState().update({ theme: 'dark' });
    const stored = localStorage.getItem('ziwei:settings') ?? '';
    expect(stored).toContain('"theme":"dark"');
    expect(stored).not.toContain(FAKE_KEY);
  });
});

describe('備份', () => {
  const input = { name: '測試', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2 } as const;

  it('匯出檔包含命盤與設定，不含金鑰與金鑰狀態', async () => {
    setKey('openai', FAKE_KEY, 'local');
    setKey('anthropic', FAKE_KEY, 'session');
    useSettings.getState().setKeyStatus('openai', { state: 'verified', modelCount: 3 });
    await saveChart(input, DEFAULT_CHART_SETTINGS);

    const backup = await createBackup();
    const text = JSON.stringify(backup);
    expect(backup.charts).toHaveLength(1);
    expect(backup.settings.model.openai).toBe('gpt-6.2-sol');
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain('keyStatus');
    expect(text).not.toContain('key:openai');
  });

  it('匯出再匯入可以還原命盤與設定', async () => {
    const saved = await saveChart(input, DEFAULT_CHART_SETTINGS);
    useSettings.getState().update({ theme: 'dark', verbosity: 'detailed' });
    const text = JSON.stringify(await createBackup());

    await (await getDB()).clear('charts');
    useSettings.setState({ ...DEFAULT_SETTINGS });

    expect(await restoreBackup(parseBackup(text))).toBe(1);
    expect(await (await getDB()).get('charts', saved.id)).toEqual(saved);
    expect(useSettings.getState().theme).toBe('dark');
    expect(useSettings.getState().verbosity).toBe('detailed');
  });

  it('匯入不會改動金鑰的儲存方式與驗證狀態', async () => {
    setKey('openai', FAKE_KEY, 'local');
    const text = JSON.stringify({ ...(await createBackup()), settings: { keyStorage: 'session', keyStatus: { openai: { state: 'verified' } } } });
    await restoreBackup(parseBackup(text));
    expect(useSettings.getState().keyStorage).toBe('local');
    expect(useSettings.getState().keyStatus.openai).toEqual({ state: 'unset' });
    expect(getKey('openai')).toBe(FAKE_KEY);
  });

  it('對話跟著命盤一起匯出與匯入；不屬於任何命盤的對話會被略過', async () => {
    const saved = await saveChart(input, DEFAULT_CHART_SETTINGS);
    const conversation = {
      ...createConversation(saved.id, '事業'),
      messages: [{ role: 'user' as const, content: '事業如何？', createdAt: '' }],
    };
    await saveConversation(conversation);
    const backup = await createBackup();
    expect(backup.conversations).toHaveLength(1);

    await (await getDB()).clear('charts');
    await (await getDB()).clear('conversations');
    const orphan = { ...conversation, id: 'orphan0000000001', chartId: 'nochart000000001' };
    const parsed = parseBackup(JSON.stringify({ ...backup, conversations: [...backup.conversations, orphan, { id: 'x' }] }));
    expect(parsed.conversations.map((item) => item.id)).toEqual([conversation.id]);
    await restoreBackup(parsed);
    expect((await listConversations(saved.id)).map((item) => item.title)).toEqual(['事業']);
  });

  it('刪除命盤時一併刪除它的對話', async () => {
    const saved = await saveChart(input, DEFAULT_CHART_SETTINGS);
    await saveConversation(createConversation(saved.id));
    await deleteChart(saved.id);
    expect(await listConversations(saved.id)).toEqual([]);
  });

  it('不是本站的備份檔會被拒絕', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"other","version":1,"charts":[]}')).toThrow('這不是本站的備份檔');
    expect(() => parseBackup('{"app":"ziwei","version":2,"charts":[]}')).toThrow(BackupError);
  });

  it('排不出盤的命盤記錄與不合法的設定值會被略過', async () => {
    const good = await saveChart(input, DEFAULT_CHART_SETTINGS);
    const backup = await createBackup();
    const tampered = {
      ...backup,
      settings: { ...backup.settings, theme: 'neon', effort: 'ultra' },
      charts: [good, { ...good, id: 'badchart00000001', input: { ...good.input, date: '2001-2-30' } }, { id: '../x' }, null],
    };
    const parsed = parseBackup(JSON.stringify(tampered));
    expect(parsed.charts.map((chart) => chart.id)).toEqual([good.id]);
    await restoreBackup(parsed);
    expect(useSettings.getState().theme).toBe('system');
    expect(useSettings.getState().effort).toBe('default');
  });
});
