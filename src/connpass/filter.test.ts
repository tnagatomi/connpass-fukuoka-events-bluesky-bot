import { describe, expect, test } from "vitest";
import { isPostable } from "./filter.ts";
import type { ConnpassEvent } from "./types.ts";

const NOW = new Date("2026-05-01T00:00:00+09:00");

const baseEvent: ConnpassEvent = {
  id: 1,
  title: "test event",
  catch: null,
  description: null,
  url: "https://connpass.com/event/1/",
  image_url: null,
  started_at: "2026-05-15T19:00:00+09:00",
  ended_at: null,
  address: null,
  place: null,
  group: null,
  event_type: "participation",
  open_status: "open",
};

describe("isPostable", () => {
  test("includes participation events", () => {
    expect(isPostable({ ...baseEvent, event_type: "participation" }, NOW)).toBe(true);
  });

  test("includes advertisement events", () => {
    expect(isPostable({ ...baseEvent, event_type: "advertisement" }, NOW)).toBe(true);
  });

  test.each(["preopen", "open", "close"] as const)("includes %s events", (status) => {
    expect(isPostable({ ...baseEvent, open_status: status }, NOW)).toBe(true);
  });

  test("excludes cancelled events", () => {
    expect(isPostable({ ...baseEvent, open_status: "cancelled" }, NOW)).toBe(false);
  });

  test("excludes events that already started (past)", () => {
    const pastEvent = { ...baseEvent, started_at: "2026-04-30T19:00:00+09:00" };
    expect(isPostable(pastEvent, NOW)).toBe(false);
  });

  test("excludes events starting at exactly now", () => {
    const exactNowEvent = { ...baseEvent, started_at: "2026-05-01T00:00:00+09:00" };
    expect(isPostable(exactNowEvent, NOW)).toBe(false);
  });

  test("includes events without a start time", () => {
    const noStartEvent = { ...baseEvent, started_at: null };
    expect(isPostable(noStartEvent, NOW)).toBe(true);
  });

  test("includes events starting in the future", () => {
    const futureEvent = { ...baseEvent, started_at: "2026-05-02T19:00:00+09:00" };
    expect(isPostable(futureEvent, NOW)).toBe(true);
  });
});
