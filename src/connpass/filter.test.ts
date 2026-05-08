import { describe, expect, test } from "vitest";
import { isPostable } from "./filter.js";
import type { ConnpassEvent } from "./types.js";

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
    expect(isPostable({ ...baseEvent, event_type: "participation" })).toBe(true);
  });

  test("includes advertisement events", () => {
    expect(isPostable({ ...baseEvent, event_type: "advertisement" })).toBe(true);
  });

  test.each(["preopen", "open", "close"] as const)("includes %s events", (status) => {
    expect(isPostable({ ...baseEvent, open_status: status })).toBe(true);
  });

  test("excludes cancelled events", () => {
    expect(isPostable({ ...baseEvent, open_status: "cancelled" })).toBe(false);
  });
});
