import { describe, expect, test } from "vitest";
import { formatJpDateTime } from "./datetime.ts";

describe("formatJpDateTime", () => {
  test("formats JST input", () => {
    expect(formatJpDateTime("2026-05-15T19:00:00+09:00")).toBe("2026年5月15日(金) 19:00〜");
  });

  test("converts UTC input to JST", () => {
    // UTC 10:00 → JST 19:00 (same day)
    expect(formatJpDateTime("2026-05-15T10:00:00Z")).toBe("2026年5月15日(金) 19:00〜");
  });

  test("handles day boundary across timezones", () => {
    // UTC 2026-05-14 23:00 → JST 2026-05-15 08:00
    expect(formatJpDateTime("2026-05-14T23:00:00Z")).toBe("2026年5月15日(金) 08:00〜");
  });

  test("handles month boundary across timezones", () => {
    // UTC 2026-04-30 16:00 → JST 2026-05-01 01:00
    expect(formatJpDateTime("2026-04-30T16:00:00Z")).toBe("2026年5月1日(金) 01:00〜");
  });

  test("handles year boundary across timezones", () => {
    // UTC 2025-12-31 16:00 → JST 2026-01-01 01:00
    expect(formatJpDateTime("2025-12-31T16:00:00Z")).toBe("2026年1月1日(木) 01:00〜");
  });

  test("omits leading zeros from month and day", () => {
    expect(formatJpDateTime("2026-01-09T09:05:00+09:00")).toBe("2026年1月9日(金) 09:05〜");
  });

  test("renders Saturday weekday", () => {
    expect(formatJpDateTime("2026-05-16T10:00:00+09:00")).toBe("2026年5月16日(土) 10:00〜");
  });

  test("renders Sunday weekday", () => {
    expect(formatJpDateTime("2026-05-17T10:00:00+09:00")).toBe("2026年5月17日(日) 10:00〜");
  });
});
