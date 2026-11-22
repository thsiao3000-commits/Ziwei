import { describe, expect, it } from 'vitest';
import { computeChart, computeHoroscope, computeLimits } from '../src/features/chart/engine';
import { DEFAULT_CHART_SETTINGS, NO_LIMITS, type BirthInput, type SavedChart } from '../src/features/chart/types';
import { parseReply } from '../src/features/reading/followups';
import { buildSystemPrompt, palacePrompt, QUICK_PROMPTS } from '../src/features/reading/prompts';
import { buildAttachment, mentionedYears, titleFrom, toChatMessages, todayString } from '../src/features/reading/request';
import { serializeChart, serializeYear } from '../src/features/reading/serialize';
import type { Message } from '../src/features/reading/types';

// 虛構的測試生日（iztro 文件範例）。
const input: BirthInput = { name: '小明', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2 };
const chart = computeChart(input, DEFAULT_CHART_SETTINGS);
const horoscope = computeHoroscope(input, DEFAULT_CHART_SETTINGS, '2026-11-21');
const saved: SavedChart = { id: 'testchart0000001', input, chartSettings: DEFAULT_CHART_SETTINGS, createdAt: '', updatedAt: '' };

describe('運限', () => {
  it('基準日的大限、流年與虛歲', () => {
    expect(horoscope.nominalAge).toBe(27);
    expect(horoscope.decadal?.ageRange).toEqual([23, 32]);
    expect(chart.palaces[horoscope.decadal!.palaceIndex]?.name).toBe('夫妻');
    expect(`${horoscope.yearly.stem}${horoscope.yearly.branch}`).toBe('丙午');
    expect(horoscope.yearly.mutagens.map((item) => `${item.mutagen}${item.star}`)).toEqual(['祿天同', '權天機', '科文昌', '忌廉貞']);
    expect(horoscope.decadalList).toHaveLength(12);
    expect(horoscope.decadalList[0]).toMatchObject({ palaceName: '命宮', ageRange: [3, 12] });
  });

  it('運限四化標出星曜所在的本命宮位', () => {
    for (const item of horoscope.yearly.mutagens) {
      const palace = chart.palaces[item.palaceIndex!];
      expect([...palace!.majorStars, ...palace!.minorStars].map((star) => star.name)).toContain(item.star);
    }
  });

  it('還沒起運時大限為 null', () => {
    expect(computeHoroscope(input, DEFAULT_CHART_SETTINGS, '2001-3-1').decadal).toBeNull();
  });

  it('指定年份：2030 年是庚戌年', () => {
    const year = computeHoroscope(input, DEFAULT_CHART_SETTINGS, '2030-7-1');
    expect(`${year.yearly.stem}${year.yearly.branch}`).toBe('庚戌');
  });
});

describe('疊宮用的運限', () => {
  it('沒有選擇時只列出十二個大限', () => {
    const limits = computeLimits(input, DEFAULT_CHART_SETTINGS, NO_LIMITS);
    expect(limits.decadals).toHaveLength(12);
    expect(limits.years).toEqual([]);
    expect(limits.months).toEqual([]);
    expect(limits.overlay).toEqual({ decadal: null, yearly: null, monthly: null });
  });

  it('選大限 → 十個流年；選流年 → 流月；各層都有四化與宮名', () => {
    const limits = computeLimits(input, DEFAULT_CHART_SETTINGS, { decadal: 2, year: 2030, month: 0 });
    expect(limits.years.map((item) => item.year)).toEqual([2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031]);
    expect(limits.years[8]).toEqual({ year: 2030, age: 31, stem: '庚', branch: '戌' });
    expect(limits.months).toHaveLength(12);
    expect(limits.months[0]?.label).toBe('正月');
    expect(limits.months[11]?.label).toBe('臘月');
    expect(`${limits.overlay.decadal?.stem}${limits.overlay.decadal?.branch}`).toBe('庚辰');
    expect(`${limits.overlay.yearly?.stem}${limits.overlay.yearly?.branch}`).toBe('庚戌');
    expect(limits.overlay.yearly?.palaceNames).toHaveLength(12);
    expect(limits.overlay.monthly?.mutagens).toHaveLength(4);
    // 與用日期算出來的運限一致
    const byDate = computeHoroscope(input, DEFAULT_CHART_SETTINGS, '2030-7-1');
    expect(limits.overlay.yearly).toEqual(byDate.yearly);
    expect(limits.overlay.decadal).toEqual({ ...byDate.decadal, ageRange: undefined });
  });

  it('閏月的年份分出前半與後半', () => {
    const limits = computeLimits(input, DEFAULT_CHART_SETTINGS, { decadal: 2, year: 2025, month: null });
    expect(limits.months.map((item) => item.label)).toContain('閏六月（前半）');
    expect(limits.months.map((item) => item.label)).toContain('閏六月（後半）');
  });

  it('超出範圍的選擇會被清掉', () => {
    const limits = computeLimits(input, DEFAULT_CHART_SETTINGS, { decadal: 2, year: 1999, month: 3 });
    expect(limits.selection).toEqual({ decadal: 2, year: null, month: null });
    expect(limits.overlay.yearly).toBeNull();
    expect(limits.months).toEqual([]);
  });
});

describe('命盤序列化', () => {
  const text = serializeChart(chart, horoscope, { school: 'sanhe' });

  it('快照', () => {
    expect(text).toMatchSnapshot();
  });

  it('預設不含稱呼、生日與時辰；四柱一律送出', () => {
    expect(text).not.toContain('小明');
    expect(text).not.toContain('2000');
    expect(text).not.toContain('二〇〇〇');
    expect(text).not.toContain('七月十七');
    expect(text).not.toContain('寅時');
    expect(text).not.toContain('【出生】');
    expect(text).toContain('【四柱】庚辰 甲申 丙午 庚寅（年柱 月柱 日柱 時柱）');
  });

  it('開啟「附上出生年月日」才加上', () => {
    const withBirth = serializeChart(chart, horoscope, { school: 'sanhe', birth: input });
    expect(withBirth).toContain('【出生】稱呼 小明｜國曆 2000-8-16｜農曆 二〇〇〇年七月十七｜寅時');
  });

  it('十二宮依命宮起的順序列完，含星曜亮度、四化與宮干飛化', () => {
    const palaceLines = text.split('\n').filter((line) => line.includes('｜主星：'));
    expect(palaceLines.map((line) => line.split('（')[0])).toEqual([
      '命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '僕役', '官祿', '田宅', '福德', '父母',
    ]);
    expect(palaceLines[0]).toContain('命宮（壬午）｜主星：紫微(廟)｜輔星：文曲(陷)');
    expect(palaceLines[0]).toContain('宮干飛化：祿→子女 權→命宮(自化) 科→官祿 忌→財帛');
    expect(text).toContain('武曲(得)[權]');
    expect(text).toContain('〔身宮〕');
  });

  it('空宮寫出對宮主星', () => {
    expect(text).toMatch(/父母（癸未）｜主星：無（空宮，對宮疾厄：天同\(不\)\[忌\]、巨門\(不\)）/);
  });

  it('生年四化、三方四正、大限一覽與目前運限', () => {
    expect(text).toContain('【生年四化】祿：太陽（在子女）｜權：武曲（在財帛）｜科：太陰（在僕役）｜忌：天同（在疾厄）');
    expect(text).toContain('【三方四正】命宮：命宮(午)、遷移(子)、財帛(寅)、官祿(戌)');
    expect(text).toContain('【大限一覽】3–12 歲 命宮(壬午)｜13–22 歲 兄弟(辛巳)');
    expect(text).toContain('【目前運限】基準日 2026-11-21｜虛歲 27');
    expect(text).toContain('大限：夫妻（23–32 歲）｜庚辰｜命宮落在本命夫妻（辰）｜四化 祿太陽(子女) 權武曲(財帛) 科太陰(僕役) 忌天同(疾厄)');
    expect(text).toMatch(/流年：丙午｜命宮落在本命命宮（午）｜四化 祿天同\(疾厄\)/);
  });

  it('取向寫進設定行；沒有運限時不寫運限區塊', () => {
    expect(serializeChart(chart, null, { school: 'feixing' })).toContain('取向：飛星四化為主');
    expect(serializeChart(chart, null, { school: 'sanhe' })).not.toContain('【目前運限】');
  });

  it('同樣的輸入每次輸出相同', () => {
    expect(serializeChart(computeChart(input, DEFAULT_CHART_SETTINGS), horoscope, { school: 'sanhe' })).toBe(text);
  });

  it('指定年份的流年', () => {
    const year = serializeYear(chart, 2030, computeHoroscope(input, DEFAULT_CHART_SETTINGS, '2030-7-1'));
    expect(year).toContain('【流年 2030】虛歲 31');
    expect(year).toContain('流年：庚戌');
    expect(year).toContain('當時大限：夫妻（23–32 歲）');
  });
});

describe('系統提示詞', () => {
  const prompt = buildSystemPrompt({ school: 'sanhe', verbosity: 'standard', today: '2026-11-21', chartContext: 'CHART' });

  it('包含各項規則、今天的日期與命盤資料', () => {
    for (const part of ['【資料】', '【依據】', '【取向】', '【語氣】', '【界線】', '【形式】', '【追問】', '【今天】2026-11-21', '<followups>']) {
      expect(prompt).toContain(part);
    }
    expect(prompt.endsWith('命盤資料：\nCHART')).toBe(true);
    expect(prompt).toContain('不輸出 HTML');
    expect(prompt).not.toContain('{{');
  });

  it('詳細度與取向會改變提示詞', () => {
    expect(prompt).toContain('標準：');
    expect(buildSystemPrompt({ school: 'feixing', verbosity: 'brief', today: '2026-11-21', chartContext: '' })).toContain('飛星四化為主');
  });

  it('快捷提問的宮位都是命盤上有的宮名', () => {
    const names = new Set(chart.palaces.map((palace) => palace.name));
    for (const quick of QUICK_PROMPTS) {
      for (const palace of quick.palaces) expect(names.has(palace), `${quick.label}：${palace}`).toBe(true);
    }
    expect(QUICK_PROMPTS.map((quick) => quick.label)).toEqual([
      '命盤總論', '性格與天賦', '事業', '財運', '投資性格摘要', '感情', '桃花與另一半', '健康留意', '目前大限', '今年流年',
    ]);
    expect(palacePrompt('官祿').message).toBe('請解讀我的官祿宮。');
  });

  it('投資性格摘要：分本命與運限兩段，只談行為傾向，運限只能更保守，不觸發自動附流年', () => {
    const quick = QUICK_PROMPTS.find((item) => item.id === 'invest')!;
    expect(quick.palaces).toEqual(['財帛', '福德', '命宮', '田宅']);
    for (const text of [
      '一、本命（長期適用）',
      '二、目前大限與今年流年',
      '請標明適用的歲數與年份',
      '不談什麼時候適合買賣，不提任何標的或價位',
      '只能讓規則更保守，不能當成放大部位的理由',
      '以「可貼上的摘要」為標題',
      '不含紫微術語',
    ]) {
      expect(quick.message).toContain(text);
    }
    // 訊息裡的四位數字會被當成年份、另外附上那一年的流年；這則提問靠的是系統提示詞裡今天的運限。
    expect(mentionedYears(quick.message, 1900)).toEqual([]);
    expect(palacePrompt('命宮').message).toBe('請解讀我的命宮。');
  });
});

describe('建議追問', () => {
  it('把區塊從正文分出來', () => {
    const reply = '結論在這裡。\n\n- 依據一\n\n<followups>\n那換工作的時機呢？\n2. 化忌在疾厄要注意什麼？\n- 今年適合進修嗎？\n</followups>';
    expect(parseReply(reply)).toEqual({
      body: '結論在這裡。\n\n- 依據一',
      followups: ['那換工作的時機呢？', '化忌在疾厄要注意什麼？', '今年適合進修嗎？'],
    });
  });

  it('串流中：區塊只出現一半時不顯示，也不閃現標籤', () => {
    const full = '正文。\n\n<followups>\n問題一\n問題二\n</followups>';
    for (let length = 0; length <= full.length; length += 1) {
      const partial = parseReply(full.slice(0, length));
      expect(partial.body).not.toContain('<');
      expect(partial.body).not.toContain('問題');
      if (length < full.length) expect(partial.followups).toEqual([]);
    }
    expect(parseReply(full).followups).toEqual(['問題一', '問題二']);
  });

  it('沒有區塊時原樣回傳；正文裡的小於符號不受影響', () => {
    expect(parseReply('大限 3 < 12，沒有追問。')).toEqual({ body: '大限 3 < 12，沒有追問。', followups: [] });
  });

  it('最多三個，略過空行與過長的行', () => {
    const reply = `x<followups>\n\n一\n二\n${'長'.repeat(81)}\n三\n四\n</followups>`;
    expect(parseReply(reply).followups).toEqual(['一', '二', '三']);
  });
});

describe('請求組裝', () => {
  const messages: Message[] = [
    { role: 'user', content: '請幫我看整張命盤的重點。', attachment: { label: '命宮', text: '【三方四正】…' }, createdAt: '' },
    { role: 'assistant', content: '命宮紫微。\n\n<followups>\n事業呢？\n</followups>', provider: 'anthropic', model: 'm', createdAt: '' },
    { role: 'assistant', content: '', provider: 'anthropic', model: 'm', createdAt: '', error: { code: 'overloaded', message: '忙碌' } },
    { role: 'user', content: '事業呢？', createdAt: '' },
  ];

  it('送出完整訊息紀錄：補充資料併入使用者訊息，回覆只送正文，空的失敗回覆略過', () => {
    expect(toChatMessages(messages)).toEqual([
      { role: 'user', content: '請幫我看整張命盤的重點。\n\n【補充資料（由排盤程式產生）】\n【三方四正】…' },
      { role: 'assistant', content: '命宮紫微。' },
      { role: 'user', content: '事業呢？' },
    ]);
  });

  it('從提問找出年份：出生前與範圍外的不算', () => {
    expect(mentionedYears('2030 庚戌年會遇到什麼樣的人？', 2000)).toEqual([2030]);
    expect(mentionedYears('1995 年、2028年和 2028 年，還有 12345 與 3000', 2000)).toEqual([2028]);
    expect(mentionedYears('沒有年份', 2000)).toEqual([]);
  });

  it('補充資料：快捷提問的宮位、選中的宮位與提到的年份', () => {
    const attachment = buildAttachment({ chart, saved, text: '2030 年事業如何？', palaceNames: ['官祿'], selectedPalace: chart.soulPalaceIndex });
    expect(attachment?.label).toBe('官祿、命宮、2030 年流年');
    expect(attachment?.text).toContain('官祿：官祿(戌)、夫妻(辰)');
    expect(attachment?.text).toContain('命宮：命宮(午)、遷移(子)、財帛(寅)、官祿(戌)');
    expect(attachment?.text).toContain('【流年 2030】');
  });

  it('沒有東西可附時不附', () => {
    expect(buildAttachment({ chart, saved, text: '你好', palaceNames: [], selectedPalace: null })).toBeUndefined();
  });

  it('今天的日期與對話標題', () => {
    expect(todayString(new Date(2026, 10, 21, 23, 30))).toBe('2026-11-21');
    expect(titleFrom('請幫我看整張命盤的重點。\n第二行')).toBe('請幫我看整張命盤的重點。');
    expect(titleFrom('這是一則非常非常長的提問內容需要被截斷才放得下')).toBe('這是一則非常非常長的提問內容需要被截…');
    expect(titleFrom('   ')).toBe('新對話');
  });
});
