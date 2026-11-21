/** 時辰索引 0–12 的對照。0 是早子時，12 是晚子時（與 iztro 的 timeIndex 相同）。 */
export const TIME_SLOTS = [
  { index: 0, name: '早子時', range: '00:00–01:00' },
  { index: 1, name: '丑時', range: '01:00–03:00' },
  { index: 2, name: '寅時', range: '03:00–05:00' },
  { index: 3, name: '卯時', range: '05:00–07:00' },
  { index: 4, name: '辰時', range: '07:00–09:00' },
  { index: 5, name: '巳時', range: '09:00–11:00' },
  { index: 6, name: '午時', range: '11:00–13:00' },
  { index: 7, name: '未時', range: '13:00–15:00' },
  { index: 8, name: '申時', range: '15:00–17:00' },
  { index: 9, name: '酉時', range: '17:00–19:00' },
  { index: 10, name: '戌時', range: '19:00–21:00' },
  { index: 11, name: '亥時', range: '21:00–23:00' },
  { index: 12, name: '晚子時', range: '23:00–24:00' },
] as const;

/** 時鐘時間（HH:mm）換成時辰索引；格式不對時回傳 null。 */
export function clockToTimeIndex(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  if (hour === 23) return 12;
  if (hour === 0) return 0;
  return Math.floor((hour + 1) / 2);
}

/** 時鐘時間是否落在指定時辰內。用來判斷使用者改選時辰後，原本輸入的時間還算不算數。 */
export function clockMatchesTimeIndex(clock: string, timeIndex: number): boolean {
  return clockToTimeIndex(clock) === timeIndex;
}

export function timeSlotLabel(timeIndex: number): string {
  const slot = TIME_SLOTS[timeIndex];
  return slot ? `${slot.name} ${slot.range}` : '';
}
