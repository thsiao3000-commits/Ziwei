import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeChart } from '../src/features/chart/engine';
import { deleteChart, saveChart } from '../src/features/chart/store';
import { DEFAULT_CHART_SETTINGS, MUTAGENS, type BirthInput } from '../src/features/chart/types';
import {
  COMPARE_PROMPTS,
  COMPARE_RULES,
  compareKey,
  crossMutagens,
  palaceRows,
  parseCompareKey,
  serializeCompare,
  soulPlacement,
} from '../src/features/compare/compare';
import { buildSystemPrompt } from '../src/features/reading/prompts';
import { createConversation, listConversations, saveConversation } from '../src/features/reading/store';
import { createBackup, parseBackup } from '../src/features/settings/backup';
import { getDB } from '../src/lib/storage/db';

// 兩組虛構的測試生日。
const inputA: BirthInput = { name: '小明', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2 };
const inputB: BirthInput = { name: '阿華', gender: 'male', calendar: 'solar', date: '1995-7-7', timeIndex: 0 };
const a = computeChart(inputA, DEFAULT_CHART_SETTINGS);
const b = computeChart(inputB, DEFAULT_CHART_SETTINGS);

beforeEach(async () => {
  await (await getDB()).clear('charts');
  await (await getDB()).clear('conversations');
});

describe('合盤：交互關係', () => {
  it('對方的命宮地支落在自己盤上的哪一宮', () => {
    const ab = soulPlacement(a, b);
    expect(ab.branch).toBe(a.soulBranch);
    expect(b.palaces.find((palace) => palace.name === ab.palaceName)?.branch).toBe(a.soulBranch);
    const ba = soulPlacement(b, a);
    expect(a.palaces.find((palace) => palace.name === ba.palaceName)?.branch).toBe(b.soulBranch);
    // 自己和自己：命宮落在命宮
    expect(soulPlacement(a, a).palaceName).toBe('命宮');
  });

  it('對方的生年四化，四顆星各落在自己盤上的哪一宮', () => {
    const cross = crossMutagens(a, b);
    expect(cross.map((item) => item.mutagen)).toEqual([...MUTAGENS]);
    expect(cross.map((item) => item.star)).toEqual(a.birthMutagens.map((item) => item.star));
    for (const item of cross) {
      const palace = b.palaces.find((candidate) => candidate.name === item.palaceName);
      expect([...palace!.majorStars, ...palace!.minorStars].map((star) => star.name), `${item.star} 在乙盤`).toContain(item.star);
    }
    // 自己和自己：就是生年四化原本的位置
    expect(crossMutagens(a, a).map((item) => item.palaceName)).toEqual(a.birthMutagens.map((item) => a.palaces[item.palaceIndex]!.name));
  });

  it('逐宮主星對照：十二宮，兩張盤各自的主星', () => {
    const rows = palaceRows(a, b);
    expect(rows.map((row) => row.palace)).toEqual(['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '僕役', '官祿', '田宅', '福德', '父母']);
    expect(rows[0]?.a).toBe('紫微(廟)');
    expect(rows.every((row) => row.a.length > 0 && row.b.length > 0)).toBe(true);
    expect(rows.some((row) => row.a === '空宮')).toBe(true);
  });
});

describe('合盤：給 AI 的資料', () => {
  const text = serializeCompare({ label: '甲', chart: a }, { label: '乙', chart: b }, 'sanhe');

  it('兩張本命盤各一段，加上程式算好的交互關係', () => {
    expect(text).toContain('【合盤】以下是兩張命盤，分別稱為「甲」與「乙」。');
    expect(text).toContain('＝＝＝ 甲 ＝＝＝');
    expect(text).toContain('＝＝＝ 乙 ＝＝＝');
    expect(text.match(/【本命十二宮】/g)).toHaveLength(2);
    expect(text).toContain('【兩盤的交互關係（由排盤程式計算）】');
    expect(text).toMatch(/甲的命宮地支（午）落在乙盤的.+；乙的命宮地支（.）落在甲盤的.+/);
    expect(text).toMatch(/甲的生年四化落在乙盤：祿 太陽→乙的.+｜權 武曲→乙的.+｜科 太陰→乙的.+｜忌 天同→乙的.+/);
    expect(text).toContain('乙的生年四化落在甲盤：');
  });

  it('不含運限，避免內容過長', () => {
    expect(text).not.toContain('【目前運限】');
    expect(text).not.toContain('【大限一覽】');
  });

  it('預設不含稱呼與生日；兩張盤的四柱都會送出', () => {
    for (const secret of ['小明', '阿華', '2000-8-16', '1995-7-7', '二〇〇〇', '一九九五', '【出生】']) expect(text).not.toContain(secret);
    expect(text).toContain(`【四柱】${a.fourPillars}`);
    expect(text).toContain(`【四柱】${b.fourPillars}`);
  });

  it('開啟「附上出生年月日」時才帶稱呼與生日', () => {
    const withBirth = serializeCompare({ label: '甲', chart: a, birth: inputA }, { label: '乙', chart: b, birth: inputB }, 'sanhe');
    expect(withBirth).toContain('【出生】稱呼 小明');
    expect(withBirth).toContain('【出生】稱呼 阿華');
  });

  it('合盤規則寫進系統提示詞：不下二分結論、不評斷好壞，其他界線規則仍在', () => {
    const prompt = buildSystemPrompt({ school: 'sanhe', verbosity: 'standard', today: '2026-11-22', chartContext: text, extraRules: COMPARE_RULES });
    expect(prompt).toContain('不要下「合」或「不合」的二分結論');
    expect(prompt).toContain('不要評斷誰好誰壞');
    expect(prompt).toContain('【界線】');
    expect(prompt).toContain('【追問】');
    expect(prompt.indexOf('【合盤】這次是比較')).toBeLessThan(prompt.indexOf('命盤資料：'));
  });

  it('快捷提問不帶單一命盤的宮位', () => {
    expect(COMPARE_PROMPTS.map((item) => item.label)).toEqual(['整體互動', '感情相處', '溝通與衝突', '金錢觀', '合作共事', '親子或家人']);
    expect(COMPARE_PROMPTS.every((item) => item.palaces.length === 0)).toBe(true);
  });
});

describe('合盤：對話的保存', () => {
  it('索引鍵由兩張盤的 id 組成，甲乙對調是不同的鍵', () => {
    expect(compareKey('aaa111', 'bbb222')).toBe('compare:aaa111:bbb222');
    expect(parseCompareKey('compare:aaa111:bbb222')).toEqual(['aaa111', 'bbb222']);
    expect(parseCompareKey('aaa111')).toBeNull();
    expect(compareKey('a', 'b')).not.toBe(compareKey('b', 'a'));
  });

  it('刪掉其中一張命盤，用到它的合盤對話也一併刪除；其他對話不受影響', async () => {
    const [one, two, three] = await Promise.all([
      saveChart(inputA, DEFAULT_CHART_SETTINGS),
      saveChart(inputB, DEFAULT_CHART_SETTINGS),
      saveChart({ ...inputB, name: '丙' }, DEFAULT_CHART_SETTINGS),
    ]);
    await saveConversation(createConversation(compareKey(one!.id, two!.id), '甲乙'));
    await saveConversation(createConversation(compareKey(three!.id, one!.id), '丙甲'));
    await saveConversation(createConversation(compareKey(two!.id, three!.id), '乙丙'));
    await saveConversation(createConversation(two!.id, '乙自己的對話'));

    await deleteChart(one!.id);

    expect(await listConversations(compareKey(one!.id, two!.id))).toEqual([]);
    expect(await listConversations(compareKey(three!.id, one!.id))).toEqual([]);
    expect((await listConversations(compareKey(two!.id, three!.id))).map((item) => item.title)).toEqual(['乙丙']);
    expect((await listConversations(two!.id)).map((item) => item.title)).toEqual(['乙自己的對話']);
  });

  it('備份包含合盤對話；匯入時兩張盤都在才收', async () => {
    const one = await saveChart(inputA, DEFAULT_CHART_SETTINGS);
    const two = await saveChart(inputB, DEFAULT_CHART_SETTINGS);
    await saveConversation(createConversation(compareKey(one.id, two.id), '合盤對話'));
    const backup = await createBackup();
    expect(backup.conversations.map((item) => item.title)).toEqual(['合盤對話']);

    expect(parseBackup(JSON.stringify(backup)).conversations).toHaveLength(1);
    const missingOne = { ...backup, charts: backup.charts.filter((chart) => chart.id !== two.id) };
    expect(parseBackup(JSON.stringify(missingOne)).conversations).toEqual([]);
  });
});
