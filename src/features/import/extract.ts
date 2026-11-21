import { clockToTimeIndex } from '../chart/time';
import { MAX_YEAR, MIN_YEAR, type ChartData } from '../chart/types';

/**
 * 截圖匯入（CR-17）。AI 只負責「讀出圖上印的出生資料」，不匯入圖上的星曜：
 * 讀到的資料帶進表單給使用者核對，命盤仍由排盤程式計算（AI 不排盤）。
 * 另外請 AI 抄下圖上的命宮地支、命宮主星與五行局，拿來和程式排出的結果比對。
 */
export const IMPORT_SYSTEM =
  '你負責從紫微斗數命盤的圖片中讀出文字資料。只回報圖上清楚看得到的內容，不要推算、不要排盤、不要猜測；看不清楚或圖上沒有的欄位一律填 null。只輸出一個 JSON 物件，不要加任何說明文字或 Markdown。';

export const IMPORT_PROMPT = `請讀這張紫微斗數命盤，回傳下列 JSON（看不到的欄位填 null）：

{
  "found": 這張圖是不是紫微斗數命盤（true 或 false）,
  "name": 圖上的姓名或稱呼,
  "gender": "male" 或 "female",
  "solar": { "year": 西元年, "month": 月, "day": 日 }（圖上有國曆／陽曆／公曆生日時填）,
  "lunar": { "year": 西元年, "month": 月, "day": 日, "isLeapMonth": 是否閏月 }（圖上有農曆／陰曆生日時填；年份請換成西元年數字）,
  "clock": 出生的時鐘時間 "HH:mm"（圖上有寫幾點幾分才填）,
  "timeBranch": 出生時辰的地支，一個字（子丑寅卯辰巳午未申酉戌亥）,
  "lateZi": 圖上標明是晚子時（夜子時）填 true，標明早子時填 false，其餘填 null,
  "soulBranch": 命宮所在的地支，一個字,
  "soulMajorStars": 命宮裡的主星名稱陣列（十四主星；沒有主星就填空陣列）,
  "fiveElementsClass": 五行局，例如 "木三局",
  "notes": 讀不清楚或有疑問的地方，用繁體中文寫一句；沒有就填 null
}

民國年請加 1911 換成西元年。只抄圖上寫的，不要自己換算國曆與農曆。`;

type DateParts = { year: number; month: number; day: number };

export type Extraction = {
  found: boolean;
  name: string | null;
  gender: 'male' | 'female' | null;
  solar: DateParts | null;
  lunar: (DateParts & { isLeapMonth: boolean }) | null;
  clock: string | null;
  timeBranch: string | null;
  lateZi: boolean | null;
  soulBranch: string | null;
  soulMajorStars: string[];
  fiveElementsClass: string | null;
  notes: string | null;
};

const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';

function text(value: unknown, max = 40): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function dateParts(value: unknown): DateParts | null {
  const date = value as Partial<DateParts> | null;
  if (typeof date !== 'object' || date === null) return null;
  const year = Number(date.year);
  const month = Number(date.month);
  const day = Number(date.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function branch(value: unknown): string | null {
  const char = typeof value === 'string' ? value.trim().charAt(0) : '';
  return char && BRANCHES.includes(char) ? char : null;
}

/** 從模型的回覆取出 JSON 並檢查每個欄位；完全讀不出來時回傳 null。 */
export function parseExtraction(reply: string): Extraction | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;

  const lunarParts = dateParts(data.lunar);
  const clock = text(data.clock, 5);
  return {
    found: data.found !== false,
    name: text(data.name, 20),
    gender: data.gender === 'male' || data.gender === 'female' ? data.gender : null,
    solar: dateParts(data.solar),
    lunar: lunarParts ? { ...lunarParts, isLeapMonth: (data.lunar as { isLeapMonth?: unknown }).isLeapMonth === true } : null,
    clock: clock && clockToTimeIndex(clock) !== null ? clock : null,
    timeBranch: branch(data.timeBranch),
    lateZi: typeof data.lateZi === 'boolean' ? data.lateZi : null,
    soulBranch: branch(data.soulBranch),
    soulMajorStars: Array.isArray(data.soulMajorStars)
      ? data.soulMajorStars.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim().slice(0, 4)).slice(0, 4)
      : [],
    fiveElementsClass: text(data.fiveElementsClass, 6),
    notes: text(data.notes, 200),
  };
}

/** 表單的起始值（全部是字串，對應表單欄位）。 */
export type BirthDraft = {
  name?: string;
  gender?: 'male' | 'female';
  calendar?: 'solar' | 'lunar';
  year?: string;
  month?: string;
  day?: string;
  isLeapMonth?: boolean;
  clock?: string;
  timeIndex?: number;
};

/** 讀到的資料 → 表單起始值。圖上同時有國曆與農曆時用國曆。 */
export function toBirthDraft(extraction: Extraction): { draft: BirthDraft; missing: string[] } {
  const draft: BirthDraft = {};
  const missing: string[] = [];

  if (extraction.name) draft.name = extraction.name;
  if (extraction.gender) draft.gender = extraction.gender;
  else missing.push('性別');

  const date = extraction.solar ?? extraction.lunar;
  if (date) {
    draft.calendar = extraction.solar ? 'solar' : 'lunar';
    draft.year = String(date.year);
    draft.month = String(date.month);
    draft.day = String(date.day);
    if (!extraction.solar && extraction.lunar) draft.isLeapMonth = extraction.lunar.isLeapMonth;
  } else {
    missing.push('出生日期');
  }

  if (extraction.clock) {
    draft.clock = extraction.clock;
    draft.timeIndex = clockToTimeIndex(extraction.clock) ?? undefined;
  } else if (extraction.timeBranch) {
    const index = BRANCHES.indexOf(extraction.timeBranch);
    // 子時分早晚：圖上有標明才決定，沒標明就留給使用者選。
    if (index > 0) draft.timeIndex = index;
    else if (extraction.lateZi === true) draft.timeIndex = 12;
    else if (extraction.lateZi === false) draft.timeIndex = 0;
  }
  if (draft.timeIndex === undefined) missing.push(extraction.timeBranch === '子' ? '時辰（圖上是子時，請選早子時或晚子時）' : '出生時辰');

  return { draft, missing };
}

export type Check = { item: string; fromImage: string; computed: string; matches: boolean };

/** 把圖上抄下來的命宮地支、命宮主星、五行局，和程式排出的命盤比對。圖上沒有的項目不比。 */
export function compareWithImage(chart: ChartData, extraction: Extraction): Check[] {
  const checks: Check[] = [];
  if (extraction.soulBranch) {
    checks.push({ item: '命宮位置', fromImage: extraction.soulBranch, computed: chart.soulBranch, matches: extraction.soulBranch === chart.soulBranch });
  }
  if (extraction.fiveElementsClass) {
    checks.push({
      item: '五行局',
      fromImage: extraction.fiveElementsClass,
      computed: chart.fiveElementsClass,
      matches: extraction.fiveElementsClass === chart.fiveElementsClass,
    });
  }
  const soul = chart.palaces[chart.soulPalaceIndex];
  if (extraction.soulBranch && soul) {
    const computed = soul.majorStars.map((star) => star.name).sort();
    const fromImage = [...extraction.soulMajorStars].sort();
    checks.push({
      item: '命宮主星',
      fromImage: fromImage.join('、') || '沒有主星',
      computed: computed.join('、') || '沒有主星',
      matches: fromImage.join() === computed.join(),
    });
  }
  return checks;
}
