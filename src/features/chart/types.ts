/** 使用者輸入的出生資料。只存這份與排盤設定，命盤每次開啟重新計算。 */
export type BirthInput = {
  name: string;
  gender: 'male' | 'female';
  calendar: 'solar' | 'lunar';
  /** YYYY-M-D，一律用字串傳遞，不經過 Date（避免時區位移）。 */
  date: string;
  isLeapMonth?: boolean;
  /** 0 早子時 … 12 晚子時 */
  timeIndex: number;
  /** HH:mm，使用者有輸入時鐘時間才存。 */
  clockTime?: string;
};

/** 排盤的流派設定，對應 iztro 的 config。 */
export type ChartSettings = {
  /** 年分界：normal 以正月初一換年，exact 以立春換年 */
  yearDivide: 'normal' | 'exact';
  /** 運限分界：同上。除了大限與流年，也決定四柱月柱與以年支起的雜曜 */
  horoscopeDivide: 'normal' | 'exact';
  /** 小限分界：normal 以自然年，birthday 以生日 */
  ageDivide: 'normal' | 'birthday';
  /** 晚子時：current 算當日，forward 算來日 */
  dayDivide: 'current' | 'forward';
  /** 安星法：default 通行版本，zhongzhou 中州派 */
  algorithm: 'default' | 'zhongzhou';
};

/**
 * 預設值與 iztro 官方線上排盤（ziwei.pub）一致，黃金測試以它為對照。
 * 注意 horoscopeDivide 用 exact（立春），和 iztro 函式庫自己的預設（normal）不同：
 * 官方排盤的四柱月柱、歲前與將前十二神、以年支起的雜曜都是依節氣算的。
 * 只有在春節與立春之間出生的人，兩種設定排出的雜曜才會不同。
 */
export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  yearDivide: 'normal',
  horoscopeDivide: 'exact',
  ageDivide: 'normal',
  dayDivide: 'forward',
  algorithm: 'default',
};

export type SavedChart = {
  id: string;
  input: BirthInput;
  /** 排盤當下的流派設定快照 */
  chartSettings: ChartSettings;
  createdAt: string;
  updatedAt: string;
  /** 最後開啟時間 */
  openedAt?: string;
  pinned?: boolean;
};

export const MUTAGENS = ['祿', '權', '科', '忌'] as const;
export type Mutagen = (typeof MUTAGENS)[number];

export type StarKind = 'major' | 'minor' | 'adjective';

export type StarInfo = {
  name: string;
  kind: StarKind;
  /** 廟旺得利平不陷；沒有亮度資料時為空字串 */
  brightness: string;
  /** 生年四化 */
  mutagen: Mutagen | null;
};

export type PalaceInfo = {
  /** 0–11，0 是寅宮，依地支順行 */
  index: number;
  name: string;
  stem: string;
  branch: string;
  isBodyPalace: boolean;
  /** 來因宮 */
  isOriginalPalace: boolean;
  majorStars: StarInfo[];
  minorStars: StarInfo[];
  adjectiveStars: StarInfo[];
  changsheng12: string;
  boshi12: string;
  jiangqian12: string;
  suiqian12: string;
  /** 大限起訖虛歲 */
  decadalRange: [number, number];
  /** 小限虛歲 */
  ages: number[];
  /** 空宮（沒有主星） */
  isEmpty: boolean;
  /** 三方四正：對宮、財帛位、官祿位的宮位索引 */
  surrounded: { opposite: number; wealth: number; career: number };
  /** 宮干飛化：祿、權、科、忌各飛入哪一宮（找不到該星時為 null） */
  flies: Record<Mutagen, number | null>;
};

export type BirthMutagen = { mutagen: Mutagen; star: string; palaceIndex: number };

export type ChartData = {
  gender: 'male' | 'female';
  /** YYYY-M-D */
  solarDate: string;
  /** 例：二〇〇〇年七月十七、二〇二〇年閏四月十五 */
  lunarDate: string;
  /** 四柱干支，例：庚辰 甲申 丙午 庚寅 */
  fourPillars: string;
  /** 例：寅時 */
  time: string;
  /** 例：03:00~05:00 */
  timeRange: string;
  zodiac: string;
  sign: string;
  soulBranch: string;
  bodyBranch: string;
  /** 命主 */
  soul: string;
  /** 身主 */
  body: string;
  fiveElementsClass: string;
  /** 依地支順序，index 0 是寅宮 */
  palaces: PalaceInfo[];
  /** 命宮的索引 */
  soulPalaceIndex: number;
  birthMutagens: BirthMutagen[];
  settings: ChartSettings;
  iztroVersion: string;
};

/** 某一層運限（大限或流年）疊在本命盤上的資料。陣列都以本命宮位索引排列。 */
export type LimitInfo = {
  stem: string;
  branch: string;
  /** 這層運限的命宮落在哪個本命宮位 */
  palaceIndex: number;
  /** 各本命宮位在這層運限裡的宮名 */
  palaceNames: string[];
  /** 這層運限的四化：星曜與它所在的本命宮位（找不到時為 null） */
  mutagens: { mutagen: Mutagen; star: string; palaceIndex: number | null }[];
  /** 各本命宮位的運曜或流曜 */
  stars: string[][];
};

export type DecadalSummary = {
  palaceIndex: number;
  palaceName: string;
  stem: string;
  branch: string;
  ageRange: [number, number];
  yearRange: [number, number];
};

export type HoroscopeData = {
  /** 基準日 YYYY-M-D */
  date: string;
  /** 虛歲 */
  nominalAge: number;
  /** 還沒起運時為 null */
  decadal: (LimitInfo & { ageRange: [number, number] }) | null;
  yearly: LimitInfo;
  decadalList: DecadalSummary[];
};

/** 盤上疊宮顯示用的運限選擇。null 表示那一層沒有選。 */
export type LimitSelection = {
  /** 大限序號，0 是第一個大限 */
  decadal: number | null;
  /** 流年的西元年，必須落在選定的大限內 */
  year: number | null;
  /** 流月在該年流月清單中的序號 */
  month: number | null;
};

export const NO_LIMITS: LimitSelection = { decadal: null, year: null, month: null };

export type YearOption = { year: number; age: number; stem: string; branch: string };
export type MonthOption = { index: number; label: string; stem: string; branch: string };

export type Limits = {
  decadals: DecadalSummary[];
  /** 選定大限內的十個流年；沒選大限時為空 */
  years: YearOption[];
  /** 選定流年的流月；沒選流年時為空 */
  months: MonthOption[];
  overlay: { decadal: LimitInfo | null; yearly: LimitInfo | null; monthly: LimitInfo | null };
  /** 正規化後的選擇（超出範圍的層會被清掉） */
  selection: LimitSelection;
};

export type ChartErrorCode =
  | 'invalid_format'
  | 'out_of_range'
  | 'invalid_solar_date'
  | 'invalid_lunar_date'
  | 'not_leap_month'
  | 'invalid_time';

export class ChartInputError extends Error {
  readonly code: ChartErrorCode;
  constructor(code: ChartErrorCode, message: string) {
    super(message);
    this.name = 'ChartInputError';
    this.code = code;
  }
}

/** 表單可輸入的年份範圍。iztro 文件沒有載明支援範圍，先保守限制。 */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
