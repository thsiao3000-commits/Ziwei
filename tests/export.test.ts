import { describe, expect, it } from 'vitest';
import { computeChart } from '../src/features/chart/engine';
import { DEFAULT_CHART_SETTINGS, type BirthInput } from '../src/features/chart/types';
import { conversationToMarkdown } from '../src/features/reading/exportMarkdown';
import type { Conversation } from '../src/features/reading/types';
import { safeFilename } from '../src/lib/download';

// 虛構的測試生日（iztro 文件範例）。
const input: BirthInput = { name: '小明', gender: 'female', calendar: 'solar', date: '2000-8-16', timeIndex: 2 };
const chart = computeChart(input, DEFAULT_CHART_SETTINGS);

const conversation: Conversation = {
  id: 'conv000000000001',
  chartId: 'chart00000000001',
  title: '事業與 2030 年',
  createdAt: '',
  updatedAt: '',
  messages: [
    { role: 'user', content: '# 我的事業如何？\n第二行', attachment: { label: '官祿、2030 年流年', text: '【三方四正】不該出現在匯出檔' }, createdAt: '' },
    {
      role: 'assistant',
      content: '**結論**：官祿宮廉貞天府。\n\n- 依據一\n\n<followups>\n那財運呢？\n</followups>',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      createdAt: '',
      usage: { inputTokens: 10, outputTokens: 5 },
    },
    { role: 'user', content: '繼續', createdAt: '' },
    {
      role: 'assistant',
      content: '寫到一半',
      provider: 'openai',
      model: 'gpt-6.2-sol',
      createdAt: '',
      incomplete: 'interrupted',
      error: { code: 'blocked', message: '瀏覽器連不上 OpenAI。' },
    },
  ],
};

describe('匯出解讀（Markdown）', () => {
  const markdown = conversationToMarkdown({ conversation, chart, name: '小明', anonymous: false, exportedOn: '2026-11-22' });

  it('標題、命盤摘要與匯出日期', () => {
    expect(markdown.startsWith('# 事業與 2030 年\n')).toBe(true);
    expect(markdown).toContain('**命盤**：小明（女）｜國曆 2000 年 8 月 16 日｜農曆 二〇〇〇年七月十七｜寅時｜四柱 庚辰 甲申 丙午 庚寅｜木三局｜命主 破軍｜身主 文昌');
    expect(markdown).toContain('匯出日期：2026-11-22');
  });

  it('提問用引用格式，不會被當成標題；標出帶入了哪些資料', () => {
    expect(markdown).toContain('## 提問\n\n> # 我的事業如何？\n> 第二行\n\n_已帶入：官祿、2030 年流年_');
  });

  it('回覆只含正文與所用模型，不含建議追問區塊與送給模型的補充資料', () => {
    expect(markdown).toContain('## 解讀\n\n**結論**：官祿宮廉貞天府。\n\n- 依據一\n\n_Claude（Anthropic）　claude-sonnet-5-5_');
    expect(markdown).not.toContain('followups');
    expect(markdown).not.toContain('那財運呢');
    expect(markdown).not.toContain('不該出現在匯出檔');
  });

  it('沒寫完或出錯的回覆會註明', () => {
    expect(markdown).toContain('寫到一半\n\n_這則回覆沒有寫完（連線中斷）。_\n\n_這則回覆以錯誤結束：瀏覽器連不上 OpenAI。_\n\n_OpenAI　gpt-6.2-sol_');
  });

  it('結尾有免責說明與工具版本', () => {
    expect(markdown).toContain('不能取代醫療、法律或財務專業意見。');
    expect(markdown.trimEnd()).toMatch(/工具：紫微命盤 v\d+\.\d+\.\d+$/);
  });

  it('不放稱呼與出生資料時，只留性別、五行局、命主與身主', () => {
    const anonymous = conversationToMarkdown({ conversation, chart, name: '小明', anonymous: true, exportedOn: '2026-11-22' });
    expect(anonymous).toContain('**命盤**：女命｜木三局｜命主 破軍｜身主 文昌');
    for (const secret of ['小明', '2000 年', '二〇〇〇', '七月十七', '寅時', '庚辰 甲申']) expect(anonymous).not.toContain(secret);
  });
});

describe('檔名', () => {
  it('路徑符號與控制字元換成底線，過長會截斷，空白用後備名稱', () => {
    expect(safeFilename('事業/財運: 2030?', '對話')).toBe('事業_財運_ 2030_');
    expect(safeFilename('a\u0000b\tc', 'x')).toBe('a_b_c');
    expect(safeFilename('   ', '對話')).toBe('對話');
    expect(safeFilename('長'.repeat(60), 'x')).toHaveLength(40);
  });
});
