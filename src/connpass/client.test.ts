import { describe, expect, test, vi } from "vitest";
import { fetchFukuokaLatestEvents, MAX_EVENTS_PER_PAGE, MAX_FETCH_EVENTS } from "./client.ts";
import type { ConnpassEvent } from "./types.ts";

const event = (id: number): ConnpassEvent => ({
  id,
  title: `event ${id}`,
  catch: null,
  description: null,
  url: `https://connpass.com/event/${id}/`,
  image_url: null,
  started_at: "2026-05-15T19:00:00+09:00",
  ended_at: null,
  address: null,
  place: null,
  group: null,
  event_type: "participation",
  open_status: "open",
});

const responseFor = (events: ConnpassEvent[], start: number) =>
  new Response(
    JSON.stringify({
      results_returned: events.length,
      results_available: events.length + start - 1,
      results_start: start,
      events,
    }),
  );

const emptyResponse = () => responseFor([], 1);

describe("fetchFukuokaLatestEvents", () => {
  test("calls /api/v2/events/ with prefecture=fukuoka, order=3, count=100, start=1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse());

    await fetchFukuokaLatestEvents("test-key", { fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0]![0] as string | URL);
    expect(url.origin + url.pathname).toBe("https://connpass.com/api/v2/events/");
    expect(url.searchParams.get("prefecture")).toBe("fukuoka");
    expect(url.searchParams.get("order")).toBe("3");
    expect(url.searchParams.get("count")).toBe("100");
    expect(url.searchParams.get("start")).toBe("1");
  });

  test("sends X-API-Key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse());

    await fetchFukuokaLatestEvents("secret-key", { fetchImpl: fetchMock });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toEqual({ "X-API-Key": "secret-key" });
  });

  test("passes an AbortSignal so a hung request can't stall the workflow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse());

    await fetchFukuokaLatestEvents("k", { fetchImpl: fetchMock });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("returns events array from the response", async () => {
    const events = [event(100)];
    const fetchMock = vi.fn().mockResolvedValue(responseFor(events, 1));

    expect(await fetchFukuokaLatestEvents("k", { fetchImpl: fetchMock })).toEqual(events);
  });

  test("throws on 429 rate limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429, statusText: "Too Many Requests" }));

    await expect(fetchFukuokaLatestEvents("k", { fetchImpl: fetchMock })).rejects.toThrow(
      "connpass API request failed: 429 Too Many Requests",
    );
  });

  test("throws on 5xx errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500, statusText: "Internal Server Error" }));

    await expect(fetchFukuokaLatestEvents("k", { fetchImpl: fetchMock })).rejects.toThrow("500");
  });
});

describe("fetchFukuokaLatestEvents pagination", () => {
  const fullPage = (idStart: number) =>
    Array.from({ length: MAX_EVENTS_PER_PAGE }, (_, i) => event(idStart - i));

  test("stops after one page when fewer than MAX_EVENTS_PER_PAGE returned", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor([event(3), event(2), event(1)], 1));

    const result = await fetchFukuokaLatestEvents("k", { fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  test("paginates with start=101 when page 1 is full and no known id matches", async () => {
    const page1 = fullPage(500);
    const page2 = [event(400)];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseFor(page1, 1))
      .mockResolvedValueOnce(responseFor(page2, 101));

    const result = await fetchFukuokaLatestEvents("k", { fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(fetchMock.mock.calls[1]![0] as string | URL);
    expect(secondUrl.searchParams.get("start")).toBe("101");
    expect(result.length).toBe(MAX_EVENTS_PER_PAGE + 1);
  });

  test("stops paginating when a page contains a known id", async () => {
    const page1 = fullPage(500);
    const fetchMock = vi.fn().mockResolvedValue(responseFor(page1, 1));

    const result = await fetchFukuokaLatestEvents("k", {
      fetchImpl: fetchMock,
      knownIds: new Set([page1[50]!.id]),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(page1);
  });

  test("caps pagination at MAX_FETCH_EVENTS even when pages keep returning full results", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
      const start = Number(new URL(url).searchParams.get("start"));
      const top = MAX_FETCH_EVENTS * 2 - (start - 1);
      return Promise.resolve(responseFor(fullPage(top), start));
    });

    const result = await fetchFukuokaLatestEvents("k", { fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(MAX_FETCH_EVENTS / MAX_EVENTS_PER_PAGE);
    expect(result.length).toBe(MAX_FETCH_EVENTS);
  });
});
