import { describe, expect, test, vi } from "vitest";
import { parseEvent, parseEvents } from "./parse.ts";

const validRaw = {
  id: 100,
  title: "Fukuoka.go",
  url: "https://connpass.com/event/100/",
  open_status: "open",
  started_at: "2026-05-15T19:00:00+09:00",
  place: "Tenjin",
  address: "Fukuoka, Chuo-ku",
};

describe("parseEvent", () => {
  test("returns a normalized event when all required fields are valid", () => {
    const event = parseEvent(validRaw);

    expect(event).not.toBeNull();
    expect(event!.id).toBe(100);
    expect(event!.title).toBe("Fukuoka.go");
    expect(event!.url).toBe("https://connpass.com/event/100/");
    expect(event!.open_status).toBe("open");
    expect(event!.started_at).toBe("2026-05-15T19:00:00+09:00");
    expect(event!.place).toBe("Tenjin");
    expect(event!.address).toBe("Fukuoka, Chuo-ku");
  });

  test("coerces missing optional strings to null", () => {
    const event = parseEvent({
      ...validRaw,
      started_at: undefined,
      place: null,
      address: 42,
    });

    expect(event).not.toBeNull();
    expect(event!.started_at).toBeNull();
    expect(event!.place).toBeNull();
    expect(event!.address).toBeNull();
  });

  test("returns null when raw is not an object", () => {
    expect(parseEvent(null)).toBeNull();
    expect(parseEvent("event")).toBeNull();
    expect(parseEvent(42)).toBeNull();
    expect(parseEvent(undefined)).toBeNull();
  });

  test("returns null when id is missing or not an integer", () => {
    expect(parseEvent({ ...validRaw, id: undefined })).toBeNull();
    expect(parseEvent({ ...validRaw, id: "100" })).toBeNull();
    expect(parseEvent({ ...validRaw, id: 1.5 })).toBeNull();
  });

  test("returns null when title is missing or not a string", () => {
    expect(parseEvent({ ...validRaw, title: undefined })).toBeNull();
    expect(parseEvent({ ...validRaw, title: 42 })).toBeNull();
  });

  test("returns null when url is missing, empty, unparseable, or non-http(s)", () => {
    expect(parseEvent({ ...validRaw, url: undefined })).toBeNull();
    expect(parseEvent({ ...validRaw, url: 42 })).toBeNull();
    expect(parseEvent({ ...validRaw, url: "" })).toBeNull();
    expect(parseEvent({ ...validRaw, url: "not a url" })).toBeNull();
    expect(parseEvent({ ...validRaw, url: "javascript:alert(1)" })).toBeNull();
    expect(parseEvent({ ...validRaw, url: "ftp://example.com/x" })).toBeNull();
  });

  test("accepts http and https urls", () => {
    expect(parseEvent({ ...validRaw, url: "http://connpass.com/event/100/" })).not.toBeNull();
    expect(parseEvent({ ...validRaw, url: "https://connpass.com/event/100/" })).not.toBeNull();
  });

  test("returns null when open_status is missing or not one of the union values", () => {
    expect(parseEvent({ ...validRaw, open_status: undefined })).toBeNull();
    expect(parseEvent({ ...validRaw, open_status: "OPEN" })).toBeNull();
    expect(parseEvent({ ...validRaw, open_status: "draft" })).toBeNull();
  });

  test("accepts every documented open_status value", () => {
    for (const status of ["preopen", "open", "close", "cancelled"] as const) {
      const event = parseEvent({ ...validRaw, open_status: status });
      expect(event).not.toBeNull();
      expect(event!.open_status).toBe(status);
    }
  });
});

describe("parseEvents", () => {
  test("throws when the response is not an object", () => {
    expect(() => parseEvents(null)).toThrow("not an object");
    expect(() => parseEvents("nope")).toThrow("not an object");
  });

  test("throws when events is not an array", () => {
    expect(() => parseEvents({ events: "not-an-array" })).toThrow("not an array");
    expect(() => parseEvents({})).toThrow("not an array");
  });

  test("returns the parsed array when every event is valid", () => {
    const events = parseEvents({ events: [validRaw, { ...validRaw, id: 101 }] });

    expect(events).toHaveLength(2);
    expect(events[0]!.id).toBe(100);
    expect(events[1]!.id).toBe(101);
  });

  test("skips invalid events and warns instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const events = parseEvents({
        events: [validRaw, { id: "bad" }, { ...validRaw, id: 101 }],
      });

      expect(events.map((e) => e.id)).toEqual([100, 101]);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
