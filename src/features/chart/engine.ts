/**
 * 排盤模組。全站只有這個檔案可以 import iztro（CLAUDE.md 規則 6）。
 * 星曜位置、四化、三方四正、飛化一律在這裡由 iztro 計算，
 * 其他程式只拿這裡輸出的本站型別，不接觸 iztro 的物件。
 */
import { astro, version as iztroVersion } from 'iztro';
import {
  ChartInputError,
  MAX_YEAR,
  MIN_YEAR,
  MUTAGENS,
  type BirthInput,
  type BirthMutagen,
  type ChartData,
  type ChartSettings,
  type Mutagen,
  type PalaceInfo,
  type StarInfo,
  type StarKind,
} from './types';

type Astrolabe = ReturnType<typeof astro.withOptions>;
type IztroPalace = Astrolabe['palaces'][number];
type IztroStar = IztroPalace['majorStars'][number];

/** iztro 的 zh-TW 語系在農曆日期裡仍輸出簡體字，這裡補成繁體。 */
const TRADITIONAL: Record<string, string> = { 腊: '臘', 闰: '閏' };

function toTraditional(text: string): string {
  return text.replace(/[腊闰]/g, (char) => TRADITIONAL[char] ?? char);
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  if (!match) throw new ChartInputError('invalid_format', '日期格式不正確，請重新選擇年月日。');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 國曆某年某月的天數。 */
export function daysInSolarMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isMutagen(value: unknown): value is Mutagen {
  return typeof value === 'string' && (MUTAGENS as readonly string[]).includes(value);
}

function build(input: BirthInput, settings: Partial<ChartSettings>, isLeapMonth: boolean): Astrolabe {
  return astro.withOptions({
    type: input.calendar,
    dateStr: input.date,
    timeIndex: input.timeIndex,
    gender: input.gender,
    isLeapMonth,
    fixLeap: true,
    // iztro 預設語系是 zh-CN，每次都要明確指定。
    language: 'zh-TW',
    // config 只作用在這張盤，不動全域設定。
    config: { ...settings },
  });
}

/**
 * 某個農曆年月是否有閏月。
 * iztro 遇到不存在的閏月會默默當成一般月份，所以用「當成閏月與否，
 * 換算出的國曆是否不同」來判斷。
 */
export function hasLeapMonth(lunarYear: number, lunarMonth: number): boolean {
  if (!Number.isInteger(lunarYear) || !Number.isInteger(lunarMonth)) return false;
  if (lunarYear < MIN_YEAR || lunarYear > MAX_YEAR || lunarMonth < 1 || lunarMonth > 12) return false;
  const probe = (isLeapMonth: boolean): string =>
    astro.withOptions({
      type: 'lunar',
      dateStr: `${lunarYear}-${lunarMonth}-1`,
      timeIndex: 0,
      gender: 'male',
      isLeapMonth,
      language: 'zh-TW',
    }).solarDate;
  try {
    return probe(true) !== probe(false);
  } catch {
    return false;
  }
}

function toStar(star: IztroStar, kind: StarKind): StarInfo {
  return {
    name: star.name,
    kind,
    brightness: star.brightness ?? '',
    mutagen: isMutagen(star.mutagen) ? star.mutagen : null,
  };
}

function toPalace(astrolabe: Astrolabe, palace: IztroPalace): PalaceInfo {
  const around = astrolabe.surroundedPalaces(palace.index);
  const flown = palace.mutagedPlaces();
  const flies = Object.fromEntries(
    MUTAGENS.map((mutagen, i) => [mutagen, flown[i]?.index ?? null]),
  ) as Record<Mutagen, number | null>;

  return {
    index: palace.index,
    name: palace.name,
    stem: palace.heavenlyStem,
    branch: palace.earthlyBranch,
    isBodyPalace: palace.isBodyPalace,
    isOriginalPalace: palace.isOriginalPalace,
    majorStars: palace.majorStars.map((star) => toStar(star, 'major')),
    minorStars: palace.minorStars.map((star) => toStar(star, 'minor')),
    adjectiveStars: palace.adjectiveStars.map((star) => toStar(star, 'adjective')),
    changsheng12: palace.changsheng12,
    boshi12: palace.boshi12,
    jiangqian12: palace.jiangqian12,
    suiqian12: palace.suiqian12,
    decadalRange: [palace.decadal.range[0], palace.decadal.range[1]],
    ages: [...palace.ages],
    isEmpty: palace.isEmpty(),
    surrounded: {
      opposite: around.opposite.index,
      wealth: around.wealth.index,
      career: around.career.index,
    },
    flies,
  };
}

/**
 * 依出生資料與流派設定排出命盤。
 * 輸入不合法時丟出 ChartInputError，訊息可直接顯示給使用者。
 */
export function computeChart(input: BirthInput, settings: ChartSettings): ChartData {
  const { year, month, day } = parseDate(input.date);

  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new ChartInputError('out_of_range', `出生年份請輸入 ${MIN_YEAR} 到 ${MAX_YEAR} 之間。`);
  }
  if (!Number.isInteger(input.timeIndex) || input.timeIndex < 0 || input.timeIndex > 12) {
    throw new ChartInputError('invalid_time', '請選擇出生時辰。');
  }
  if (month < 1 || month > 12 || day < 1) {
    throw new ChartInputError('invalid_format', '日期格式不正確，請重新選擇年月日。');
  }

  const wantsLeap = input.calendar === 'lunar' && input.isLeapMonth === true;

  if (input.calendar === 'solar') {
    if (day > daysInSolarMonth(year, month)) {
      throw new ChartInputError('invalid_solar_date', `國曆 ${year} 年 ${month} 月沒有 ${day} 日。`);
    }
  } else {
    if (day > 30) {
      throw new ChartInputError('invalid_lunar_date', `農曆 ${year} 年 ${month} 月沒有 ${day} 日。`);
    }
    if (wantsLeap && !hasLeapMonth(year, month)) {
      throw new ChartInputError('not_leap_month', `農曆 ${year} 年沒有閏 ${month} 月，請取消勾選「閏月」。`);
    }
  }

  const smallMonth = new ChartInputError(
    'invalid_lunar_date',
    `農曆 ${year} 年${wantsLeap ? '閏' : ''} ${month} 月沒有 ${day} 日（這個月是小月，只有 29 天）。`,
  );

  let astrolabe: Astrolabe;
  try {
    astrolabe = build(input, settings, wantsLeap);
  } catch {
    // 農曆小月的三十日會被 iztro 擋下。
    if (input.calendar === 'lunar' && day === 30) throw smallMonth;
    throw new ChartInputError(
      input.calendar === 'solar' ? 'invalid_solar_date' : 'invalid_lunar_date',
      '這個日期無法排盤，請確認年月日是否正確。',
    );
  }

  // 晚子時「算來日」時，iztro 回報的農曆日期會是隔天。出生當天真正的農曆日期
  // 要用「算當日」再算一次才拿得到；核對農曆輸入與畫面顯示都用這個日期。
  const calendarDay =
    input.timeIndex === 12 && settings.dayDivide === 'forward'
      ? build(input, { ...settings, dayDivide: 'current' }, wantsLeap)
      : astrolabe;

  if (input.calendar === 'lunar') {
    // 再用換算回來的農曆日期核對一次，確保排出的就是使用者輸入的那一天。
    const lunar = calendarDay.rawDates.lunarDate;
    if (lunar.lunarYear !== year || lunar.lunarMonth !== month || lunar.lunarDay !== day || lunar.isLeap !== wantsLeap) {
      throw smallMonth;
    }
  }

  const palaces = astrolabe.palaces.map((palace) => toPalace(astrolabe, palace));

  const birthMutagens: BirthMutagen[] = [];
  for (const mutagen of MUTAGENS) {
    for (const palace of palaces) {
      for (const star of [...palace.majorStars, ...palace.minorStars]) {
        if (star.mutagen === mutagen) birthMutagens.push({ mutagen, star: star.name, palaceIndex: palace.index });
      }
    }
  }

  const soulPalaceIndex = palaces.findIndex((palace) => palace.branch === astrolabe.earthlyBranchOfSoulPalace);

  return {
    gender: input.gender,
    solarDate: astrolabe.solarDate,
    lunarDate: toTraditional(calendarDay.lunarDate),
    fourPillars: astrolabe.chineseDate,
    time: astrolabe.time,
    timeRange: astrolabe.timeRange,
    zodiac: astrolabe.zodiac,
    sign: astrolabe.sign,
    soulBranch: astrolabe.earthlyBranchOfSoulPalace,
    bodyBranch: astrolabe.earthlyBranchOfBodyPalace,
    soul: astrolabe.soul,
    body: astrolabe.body,
    fiveElementsClass: astrolabe.fiveElementsClass,
    palaces,
    soulPalaceIndex,
    birthMutagens,
    settings: { ...settings },
    iztroVersion,
  };
}
