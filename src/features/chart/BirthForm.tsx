import { useId, useMemo, useState, type FormEvent } from 'react';
import { daysInSolarMonth } from './calendar';
import { loadEngine, useEngine } from './engineLoader';
import { clockMatchesTimeIndex, clockToTimeIndex, TIME_SLOTS, timeSlotLabel } from './time';
import type { BirthDraft } from '../import/extract';
import { useSettings } from '../settings/store';
import { ChartInputError, MAX_YEAR, MIN_YEAR, type BirthInput } from './types';

type Props = {
  /** 輸入通過檢核、可以排盤時呼叫 */
  onSubmit: (input: BirthInput) => Promise<void> | void;
  /** 表單的起始值（例如從截圖讀到的資料）。要換一組起始值時，用 key 讓表單重建 */
  initial?: BirthDraft;
};

const fieldClass =
  'w-full rounded-control border border-line bg-bg px-3 py-2 font-serif text-base text-ink disabled:border-line-soft disabled:text-ink-muted';
const labelClass = 'block font-kai text-[1.0625rem] font-bold';
const choiceClass =
  'flex cursor-pointer items-center gap-2 rounded-control border border-line px-4 py-2 has-[:checked]:bg-accent has-[:checked]:text-accent-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus';

export function BirthForm({ onSubmit, initial = {} }: Props) {
  const id = useId();
  const [name, setName] = useState(initial.name ?? '我');
  const [gender, setGender] = useState<BirthInput['gender'] | ''>(initial.gender ?? '');
  const [calendar, setCalendar] = useState<BirthInput['calendar']>(initial.calendar ?? 'solar');
  const [year, setYear] = useState(initial.year ?? '');
  const [month, setMonth] = useState(initial.month ?? '');
  const [day, setDay] = useState(initial.day ?? '');
  const [isLeapMonth, setIsLeapMonth] = useState(initial.isLeapMonth ?? false);
  const [clock, setClock] = useState(initial.clock ?? '');
  const [timeIndex, setTimeIndex] = useState<number | ''>(initial.timeIndex ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const yearNumber = /^\d{4}$/.test(year) ? Number(year) : null;
  const monthNumber = month === '' ? null : Number(month);
  const yearInRange = yearNumber !== null && yearNumber >= MIN_YEAR && yearNumber <= MAX_YEAR;

  const dayCount = useMemo(() => {
    if (calendar === 'lunar') return 30;
    if (yearNumber === null || monthNumber === null) return 31;
    return daysInSolarMonth(yearNumber, monthNumber);
  }, [calendar, yearNumber, monthNumber]);

  // 只有該年該月確實有閏月才可勾選。
  const engine = useEngine();
  const leapAvailable = useMemo(
    () => calendar === 'lunar' && yearInRange && monthNumber !== null && engine !== null && engine.hasLeapMonth(yearNumber, monthNumber),
    [calendar, engine, yearInRange, yearNumber, monthNumber],
  );
  const leapChecked = leapAvailable && isLeapMonth;

  function onClockChange(value: string) {
    setClock(value);
    const index = clockToTimeIndex(value);
    if (index !== null) setTimeIndex(index);
  }

  function onTimeIndexChange(value: string) {
    const index = value === '' ? '' : Number(value);
    setTimeIndex(index);
    // 改選的時辰和原本輸入的時間對不上時，清掉時間，避免兩者矛盾。
    if (index !== '' && clock && !clockMatchesTimeIndex(clock, index)) setClock('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (gender === '') return setError('請選擇性別。大限順行或逆行取決於性別與出生年的陰陽。');
    if (yearNumber === null) return setError('請輸入四位數的出生年份，例如 1990。');
    if (!yearInRange) return setError(`出生年份請輸入 ${MIN_YEAR} 到 ${MAX_YEAR} 之間。`);
    if (monthNumber === null || day === '') return setError('請選擇出生的月份與日期。');
    if (timeIndex === '') return setError('請輸入出生時間，或直接選擇時辰。');

    const input: BirthInput = {
      name: name.trim() || '我',
      gender,
      calendar,
      date: `${yearNumber}-${monthNumber}-${Number(day)}`,
      timeIndex,
      ...(calendar === 'lunar' ? { isLeapMonth: leapChecked } : {}),
      ...(clock && clockMatchesTimeIndex(clock, timeIndex) ? { clockTime: clock } : {}),
    };

    try {
      // 先排一次確認日期合法（例如農曆小月沒有三十日）。排盤模組還沒載完就等它。
      (await loadEngine()).computeChart(input, useSettings.getState().chartDefaults);
    } catch (cause) {
      setError(cause instanceof ChartInputError ? cause.message : '排盤時發生錯誤，請確認輸入後再試一次。');
      return;
    }

    setBusy(true);
    try {
      await onSubmit(input);
    } catch {
      setError('命盤無法存到這台裝置。請確認瀏覽器沒有停用網站儲存空間（例如無痕模式），再試一次。');
    } finally {
      setBusy(false);
    }
  }

  const isZiHour = timeIndex === 0 || timeIndex === 12;

  return (
    <form onSubmit={handleSubmit} noValidate className="grid max-w-[28rem] gap-5" aria-describedby={error ? `${id}-error` : undefined}>
      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>
          稱呼 <span className="font-serif text-sm font-normal text-ink-muted">選填</span>
        </label>
        <input
          id={`${id}-name`}
          className={`${fieldClass} mt-1`}
          value={name}
          maxLength={20}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <fieldset>
        <legend className={labelClass}>性別</legend>
        <div className="mt-1 flex gap-2">
          {(
            [
              ['male', '男'],
              ['female', '女'],
            ] as const
          ).map(([value, text]) => (
            <label key={value} className={choiceClass}>
              <input
                type="radio"
                name={`${id}-gender`}
                value={value}
                checked={gender === value}
                onChange={() => setGender(value)}
                className="sr-only"
              />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelClass}>曆法</legend>
        <div className="mt-1 flex gap-2">
          {(
            [
              ['solar', '國曆'],
              ['lunar', '農曆'],
            ] as const
          ).map(([value, text]) => (
            <label key={value} className={choiceClass}>
              <input
                type="radio"
                name={`${id}-calendar`}
                value={value}
                checked={calendar === value}
                onChange={() => {
                  setCalendar(value);
                  setDay('');
                }}
                className="sr-only"
              />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelClass}>出生日期（{calendar === 'solar' ? '國曆' : '農曆'}）</legend>
        <div className="mt-1 grid grid-cols-[1.4fr_1fr_1fr] gap-2">
          <div>
            <label htmlFor={`${id}-year`} className="text-sm text-ink-muted">
              年（西元）
            </label>
            <input
              id={`${id}-year`}
              className={fieldClass}
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="1990"
              autoComplete="off"
              value={year}
              onChange={(event) => setYear(event.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div>
            <label htmlFor={`${id}-month`} className="text-sm text-ink-muted">
              月
            </label>
            <select
              id={`${id}-month`}
              className={fieldClass}
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setIsLeapMonth(false);
              }}
            >
              <option value="">月</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => (
                <option key={value} value={value}>
                  {value} 月
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-day`} className="text-sm text-ink-muted">
              日
            </label>
            <select
              id={`${id}-day`}
              className={fieldClass}
              value={day !== '' && Number(day) > dayCount ? '' : day}
              onChange={(event) => setDay(event.target.value)}
            >
              <option value="">日</option>
              {Array.from({ length: dayCount }, (_, i) => i + 1).map((value) => (
                <option key={value} value={value}>
                  {value} 日
                </option>
              ))}
            </select>
          </div>
        </div>

        {calendar === 'lunar' && (
          <div className="mt-2">
            <label className={`flex items-center gap-2 ${leapAvailable ? '' : 'text-ink-muted'}`}>
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={leapChecked}
                disabled={!leapAvailable}
                onChange={(event) => setIsLeapMonth(event.target.checked)}
              />
              閏月
            </label>
            <p className="text-sm text-ink-muted">
              {leapAvailable
                ? `農曆 ${yearNumber} 年有閏 ${monthNumber} 月。在閏月出生才需要勾選。`
                : yearInRange && monthNumber !== null
                  ? `農曆 ${yearNumber} 年沒有閏 ${monthNumber} 月，不需要勾選。`
                  : '選好年份與月份後，這裡會顯示該月有沒有閏月。'}
            </p>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className={labelClass}>出生時間</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${id}-clock`} className="text-sm text-ink-muted">
              時鐘時間
            </label>
            <input
              id={`${id}-clock`}
              type="time"
              className={fieldClass}
              value={clock}
              onChange={(event) => onClockChange(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${id}-slot`} className="text-sm text-ink-muted">
              或直接選時辰
            </label>
            <select
              id={`${id}-slot`}
              className={fieldClass}
              value={timeIndex}
              onChange={(event) => onTimeIndexChange(event.target.value)}
            >
              <option value="">時辰</option>
              {TIME_SLOTS.map((slot) => (
                <option key={slot.index} value={slot.index}>
                  {slot.name} {slot.range}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-2 font-kai" aria-live="polite">
          {timeIndex === '' ? <span className="text-ink-muted">尚未選擇時辰</span> : timeSlotLabel(timeIndex)}
        </p>
        {isZiHour && (
          <p className="mt-1 max-w-[34em] text-sm text-ink-muted">
            子時跨午夜，分成兩段：00:00–01:00 是早子時，23:00–24:00 是晚子時。晚子時的日柱與星曜依隔天計算，兩者排出的命盤不同。
          </p>
        )}
      </fieldset>

      {error && (
        <p id={`${id}-error`} role="alert" className="border-l-2 border-danger pl-3 text-danger">
          {error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-control bg-accent px-6 py-3 font-kai text-[1.125rem] font-bold text-accent-ink disabled:opacity-60"
        >
          排出命盤
        </button>
      </div>
    </form>
  );
}
