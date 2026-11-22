/** 不需要排盤函式庫的曆法小工具（首頁表單在 iztro 載入前就會用到）。 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 國曆某年某月的天數。 */
export function daysInSolarMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 國曆日期的前一天。日期用 YYYY-M-D 字串，不經過 Date（避免時區位移）。 */
export function previousSolarDay(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  if (day > 1) return `${year}-${month}-${day - 1}`;
  if (month > 1) return `${year}-${month - 1}-${daysInSolarMonth(year, month - 1)}`;
  return `${year - 1}-12-31`;
}
