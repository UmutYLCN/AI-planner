/**
 * Calendar-day helpers for cloud tasks.
 *
 * `due_date` is a plain `YYYY-MM-DD` string that means a local calendar day in
 * Europe/Istanbul. It is deliberately never converted to a UTC instant — doing that is
 * exactly how a task dated "24 August" ends up rendering as 23 August for some users.
 */

export const PLANNER_TIMEZONE = "Europe/Istanbul";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLANNER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar day in the planner timezone, as `YYYY-MM-DD`. */
export function todayInPlannerTimezone(now: Date = new Date()): string {
  // "en-CA" formats as YYYY-MM-DD, which is exactly the shape we store.
  return dayFormatter.format(now);
}

/** Shifts a `YYYY-MM-DD` string by whole days, staying entirely in calendar arithmetic. */
export function shiftCalendarDay(date: string, days: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  // UTC math on a date-only value is safe: no timezone is ever applied to the result.
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${shiftedMonth}-${shiftedDay}`;
}

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/**
 * Human-readable label for a calendar day, formatted from the string's own parts so no
 * timezone conversion can shift it.
 */
export function formatCalendarDay(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const month = MONTHS_TR[Number(date.slice(5, 7)) - 1];
  if (!month) return date;
  return `${Number(date.slice(8, 10))} ${month} ${date.slice(0, 4)}`;
}

export type DueBucket = "overdue" | "today" | "upcoming";

/** Where a task's due date sits relative to today, in planner-local calendar terms. */
export function dueBucket(dueDate: string, today: string = todayInPlannerTimezone()): DueBucket {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return "upcoming";
}

/** Short relative label ("Bugün", "Yarın", "3 gün gecikti", …) for a calendar day. */
export function relativeDayLabel(dueDate: string, today: string = todayInPlannerTimezone()): string {
  if (dueDate === today) return "Bugün";
  if (dueDate === shiftCalendarDay(today, 1)) return "Yarın";
  if (dueDate === shiftCalendarDay(today, -1)) return "Dün";

  const diff = calendarDayDifference(today, dueDate);
  if (diff < 0) return `${Math.abs(diff)} gün gecikti`;
  return `${diff} gün sonra`;
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is earlier. */
export function calendarDayDifference(from: string, to: string): number {
  const start = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}
