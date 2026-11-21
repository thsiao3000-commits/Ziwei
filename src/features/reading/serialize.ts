import { MUTAGENS, type BirthInput, type ChartData, type HoroscopeData, type LimitInfo, type PalaceInfo, type StarInfo } from '../chart/types';

/**
 * 把排盤結果轉成精簡、穩定的文字，放進系統提示詞（HANDOFF 第 6.1 節）。
 * 純函式：同樣的輸入永遠得到同樣的文字，有快照測試。
 *
 * 只送解讀需要的內容。四柱干支一律送出（業主指定；解讀會用到，但它可以反推出生日期，
 * 介面上有說明）。稱呼、國曆與農曆生日、出生時辰預設不送；使用者開啟
 * 「提問時附上出生年月日」才加上。
 */
export type School = 'sanhe' | 'feixing';

export const SCHOOL_LABEL: Record<School, string> = {
  sanhe: '三合為主（重星曜組合、三方四正、格局）',
  feixing: '飛星四化為主（重宮干飛化、自化、忌的流向）',
};

export type SerializeOptions = {
  school: School;
  /** 有給才會寫出稱呼、生日與時辰 */
  birth?: BirthInput;
};

function star(item: StarInfo): string {
  const brightness = item.brightness ? `(${item.brightness})` : '';
  const mutagen = item.mutagen ? `[${item.mutagen}]` : '';
  return `${item.name}${brightness}${mutagen}`;
}

function stars(list: readonly StarInfo[]): string {
  return list.length > 0 ? list.map(star).join('、') : '無';
}

/** 依命宮、兄弟、夫妻……的順序（逆時針，也就是索引遞減）。 */
export function palacesFromSoul(chart: ChartData): PalaceInfo[] {
  return Array.from({ length: 12 }, (_, i) => chart.palaces[(chart.soulPalaceIndex - i + 12) % 12]).filter(
    (palace): palace is PalaceInfo => palace !== undefined,
  );
}

function palaceLine(chart: ChartData, palace: PalaceInfo): string {
  const opposite = chart.palaces[palace.surrounded.opposite];
  const major = palace.isEmpty
    ? `無（空宮，對宮${opposite?.name ?? ''}：${stars(opposite?.majorStars ?? [])}）`
    : stars(palace.majorStars);
  const flies = MUTAGENS.map((mutagen) => {
    const index = palace.flies[mutagen];
    const target = index === null ? undefined : chart.palaces[index];
    if (!target) return `${mutagen}→無`;
    return `${mutagen}→${target.name}${index === palace.index ? '(自化)' : ''}`;
  }).join(' ');
  const marks = [palace.isBodyPalace ? '身宮' : '', palace.isOriginalPalace ? '來因宮' : ''].filter(Boolean).join('、');

  return [
    `${palace.name}（${palace.stem}${palace.branch}）${marks ? `〔${marks}〕` : ''}`,
    `主星：${major}`,
    `輔星：${stars(palace.minorStars)}`,
    `雜曜：${palace.adjectiveStars.length > 0 ? palace.adjectiveStars.map((item) => item.name).join('、') : '無'}`,
    `長生 ${palace.changsheng12}、博士 ${palace.boshi12}`,
    `大限 ${palace.decadalRange[0]}–${palace.decadalRange[1]}`,
    `宮干飛化：${flies}`,
  ].join('｜');
}

/** 某一宮的三方四正，例如「官祿：官祿(戌)、夫妻(辰)、命宮(午)、財帛(寅)」。 */
export function surroundedLine(chart: ChartData, palaceIndex: number): string {
  const palace = chart.palaces[palaceIndex];
  if (!palace) return '';
  const names = [palace.index, palace.surrounded.opposite, palace.surrounded.wealth, palace.surrounded.career]
    .map((index) => chart.palaces[index])
    .map((item) => (item ? `${item.name}(${item.branch})` : ''))
    .join('、');
  return `${palace.name}：${names}（依序為本宮、對宮、財帛位、官祿位）`;
}

function limitLine(chart: ChartData, limit: LimitInfo): string {
  const mutagens = limit.mutagens
    .map(({ mutagen, star: name, palaceIndex }) => {
      const where = palaceIndex === null ? '' : `(${chart.palaces[palaceIndex]?.name ?? ''})`;
      return `${mutagen}${name}${where}`;
    })
    .join(' ');
  const flowing = limit.stars
    .map((list, index) => (list.length > 0 ? `${chart.palaces[index]?.name ?? ''}：${list.join('、')}` : ''))
    .filter(Boolean)
    .join('；');
  const soul = chart.palaces[limit.palaceIndex];
  return [
    `${limit.stem}${limit.branch}`,
    `命宮落在本命${soul?.name ?? ''}（${soul?.branch ?? ''}）`,
    `四化 ${mutagens}`,
    `曜：${flowing || '無'}`,
  ].join('｜');
}

/** 指定年份的流年資料，追問提到某一年時附上。 */
export function serializeYear(chart: ChartData, year: number, horoscope: HoroscopeData): string {
  const decadal = horoscope.decadal
    ? `當時大限：${chart.palaces[horoscope.decadal.palaceIndex]?.name ?? ''}（${horoscope.decadal.ageRange[0]}–${horoscope.decadal.ageRange[1]} 歲）｜${limitLine(chart, horoscope.decadal)}`
    : '當時尚未起運';
  return [`【流年 ${year}】虛歲 ${horoscope.nominalAge}`, decadal, `流年：${limitLine(chart, horoscope.yearly)}`].join('\n');
}

const DIVIDE = { normal: '正月初一', exact: '立春' } as const;

export function serializeChart(chart: ChartData, horoscope: HoroscopeData | null, options: SerializeOptions): string {
  const lines: string[] = [];
  const gender = chart.gender === 'male' ? '男' : '女';

  lines.push(
    `【命主】${gender}｜五行局 ${chart.fiveElementsClass}｜命主 ${chart.soul}｜身主 ${chart.body}｜命宮在${chart.soulBranch}｜身宮在${chart.bodyBranch}`,
  );
  lines.push(`【四柱】${chart.fourPillars}（年柱 月柱 日柱 時柱）`);

  if (options.birth) {
    const calendar = options.birth.calendar === 'solar' ? '國曆' : '農曆';
    lines.push(
      `【出生】稱呼 ${options.birth.name}｜國曆 ${chart.solarDate}｜農曆 ${chart.lunarDate}｜${chart.time}（${chart.timeRange}）｜輸入曆法 ${calendar}`,
    );
  }

  const s = chart.settings;
  lines.push(
    `【設定】取向：${SCHOOL_LABEL[options.school]}｜年分界：${DIVIDE[s.yearDivide]}｜運限分界：${DIVIDE[s.horoscopeDivide]}｜晚子時：${s.dayDivide === 'forward' ? '算來日' : '算當日'}｜安星：${s.algorithm === 'default' ? '通行版本' : '中州派'}｜函式庫：iztro ${chart.iztroVersion}`,
  );

  lines.push('【本命十二宮】');
  for (const palace of palacesFromSoul(chart)) lines.push(palaceLine(chart, palace));

  lines.push(
    `【生年四化】${chart.birthMutagens
      .map((item) => `${item.mutagen}：${item.star}（在${chart.palaces[item.palaceIndex]?.name ?? ''}）`)
      .join('｜')}`,
  );

  lines.push(`【三方四正】${surroundedLine(chart, chart.soulPalaceIndex)}`);

  if (horoscope) {
    lines.push(
      `【大限一覽】${horoscope.decadalList
        .map((item) => `${item.ageRange[0]}–${item.ageRange[1]} 歲 ${item.palaceName}(${item.stem}${item.branch})`)
        .join('｜')}`,
    );
    lines.push(`【目前運限】基準日 ${horoscope.date}｜虛歲 ${horoscope.nominalAge}`);
    lines.push(
      horoscope.decadal
        ? `大限：${chart.palaces[horoscope.decadal.palaceIndex]?.name ?? ''}（${horoscope.decadal.ageRange[0]}–${horoscope.decadal.ageRange[1]} 歲）｜${limitLine(chart, horoscope.decadal)}`
        : '大限：尚未起運',
    );
    lines.push(`流年：${limitLine(chart, horoscope.yearly)}`);
  }

  return lines.join('\n');
}
