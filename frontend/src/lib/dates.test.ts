import { afterEach, describe, expect, it, vi } from "vitest";

import {
  calendarDayDifference,
  dueBucket,
  formatCalendarDay,
  relativeDayLabel,
  shiftCalendarDay,
  todayInPlannerTimezone,
} from "@/lib/dates";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayInPlannerTimezone", () => {
  it("uses the Europe/Istanbul calendar day, not the machine's", () => {
    // 22:30 UTC on 23 Aug is already 01:30 on 24 Aug in Istanbul (UTC+3).
    expect(todayInPlannerTimezone(new Date("2026-08-23T22:30:00Z"))).toBe("2026-08-24");
    expect(todayInPlannerTimezone(new Date("2026-08-23T20:00:00Z"))).toBe("2026-08-23");
  });

  it("does not roll over just before midnight Istanbul time", () => {
    expect(todayInPlannerTimezone(new Date("2026-08-23T20:59:59Z"))).toBe("2026-08-23");
    expect(todayInPlannerTimezone(new Date("2026-08-23T21:00:00Z"))).toBe("2026-08-24");
  });
});

describe("shiftCalendarDay", () => {
  it("moves whole calendar days", () => {
    expect(shiftCalendarDay("2026-08-24", 1)).toBe("2026-08-25");
    expect(shiftCalendarDay("2026-08-24", -1)).toBe("2026-08-23");
    expect(shiftCalendarDay("2026-08-24", 0)).toBe("2026-08-24");
  });

  it("crosses month and year boundaries", () => {
    expect(shiftCalendarDay("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftCalendarDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftCalendarDay("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("never drifts a day regardless of the machine timezone", () => {
    // A date-only value must survive the round trip even when local time is behind UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T23:30:00Z"));
    expect(shiftCalendarDay("2026-08-24", 0)).toBe("2026-08-24");
    expect(shiftCalendarDay(shiftCalendarDay("2026-08-24", 30), -30)).toBe("2026-08-24");
  });
});

describe("calendarDayDifference", () => {
  it("counts signed whole days", () => {
    expect(calendarDayDifference("2026-08-24", "2026-08-24")).toBe(0);
    expect(calendarDayDifference("2026-08-24", "2026-08-27")).toBe(3);
    expect(calendarDayDifference("2026-08-24", "2026-08-21")).toBe(-3);
  });
});

describe("dueBucket", () => {
  it("classifies against the planner's today", () => {
    expect(dueBucket("2026-08-23", "2026-08-24")).toBe("overdue");
    expect(dueBucket("2026-08-24", "2026-08-24")).toBe("today");
    expect(dueBucket("2026-08-25", "2026-08-24")).toBe("upcoming");
  });
});

describe("relativeDayLabel", () => {
  it("labels the days around today", () => {
    expect(relativeDayLabel("2026-08-24", "2026-08-24")).toBe("Bugün");
    expect(relativeDayLabel("2026-08-25", "2026-08-24")).toBe("Yarın");
    expect(relativeDayLabel("2026-08-23", "2026-08-24")).toBe("Dün");
    expect(relativeDayLabel("2026-08-27", "2026-08-24")).toBe("3 gün sonra");
    expect(relativeDayLabel("2026-08-20", "2026-08-24")).toBe("4 gün gecikti");
  });
});

describe("formatCalendarDay", () => {
  it("formats from the string's own parts, so no timezone can shift it", () => {
    expect(formatCalendarDay("2026-08-24")).toBe("24 Ağustos 2026");
    expect(formatCalendarDay("2026-01-01")).toBe("1 Ocak 2026");
    expect(formatCalendarDay("2026-12-31")).toBe("31 Aralık 2026");
  });

  it("shows the stored day even at a timezone boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T23:59:00Z"));
    // Naive `new Date("2026-08-24").toLocaleDateString()` would print 23 August here.
    expect(formatCalendarDay("2026-08-24")).toBe("24 Ağustos 2026");
  });

  it("passes through anything that is not a calendar day", () => {
    expect(formatCalendarDay("")).toBe("");
    expect(formatCalendarDay("not-a-date")).toBe("not-a-date");
  });
});
