import { describe, expect, test, vi } from "vitest";
import { fetchFukuokaLatestEvents } from "./client.js";
import type { ConnpassEvent } from "./types.js";

const emptyBody = {
  results_returned: 0,
  results_available: 0,
  results_start: 0,
  events: [],
};

describe("fetchFukuokaLatestEvents", () => {
  test("calls /api/v2/events/ with prefecture=fukuoka, order=3, default count=100", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(emptyBody)));

    await fetchFukuokaLatestEvents("test-key", undefined, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0]![0] as string | URL);
    expect(url.origin + url.pathname).toBe("https://connpass.com/api/v2/events/");
    expect(url.searchParams.get("prefecture")).toBe("fukuoka");
    expect(url.searchParams.get("order")).toBe("3");
    expect(url.searchParams.get("count")).toBe("100");
  });

  test("sends X-API-Key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(emptyBody)));

    await fetchFukuokaLatestEvents("secret-key", undefined, fetchMock);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toEqual({ "X-API-Key": "secret-key" });
  });

  test("respects custom count parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(emptyBody)));

    await fetchFukuokaLatestEvents("k", 50, fetchMock);

    const url = new URL(fetchMock.mock.calls[0]![0] as string | URL);
    expect(url.searchParams.get("count")).toBe("50");
  });

  test("returns events array from the response", async () => {
    const event: ConnpassEvent = {
      id: 100,
      title: "Fukuoka.go",
      catch: null,
      description: null,
      url: "https://connpass.com/event/100/",
      image_url: null,
      started_at: "2026-05-15T19:00:00+09:00",
      ended_at: null,
      address: null,
      place: null,
      group: null,
      event_type: "participation",
      open_status: "open",
    };
    const body = { ...emptyBody, results_returned: 1, events: [event] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));

    expect(await fetchFukuokaLatestEvents("k", undefined, fetchMock)).toEqual([event]);
  });

  test("throws on 429 rate limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429, statusText: "Too Many Requests" }));

    await expect(fetchFukuokaLatestEvents("k", undefined, fetchMock)).rejects.toThrow(
      "connpass API request failed: 429 Too Many Requests",
    );
  });

  test("throws on 5xx errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500, statusText: "Internal Server Error" }));

    await expect(fetchFukuokaLatestEvents("k", undefined, fetchMock)).rejects.toThrow("500");
  });
});
