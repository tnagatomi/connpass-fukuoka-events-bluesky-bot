import { parseEvents, type ParsedEventsPage } from "./parse.ts";
import type { ConnpassEvent } from "./types.ts";

const ENDPOINT = "https://connpass.com/api/v2/events/";
const ORDER_NEWEST = "3";
const TIMEOUT_MS = 10_000;

// connpass API caps `count` at 100 per request.
export const MAX_EVENTS_PER_PAGE = 100;

// Each page fetch has a 10s timeout, so 5 pages is ~50s worst-case — well
// inside the 4-minute BATCH_DEADLINE in main.ts.
const MAX_PAGES = 5;

// Upper bound on events fetched per run via pagination. Reused as the dedupe
// window cap in posted-events.ts so we never forget an id that could still
// reappear within the deepest page we'll fetch next time.
export const MAX_FETCH_EVENTS = MAX_EVENTS_PER_PAGE * MAX_PAGES;

export type FetchOptions = {
  fetchImpl?: typeof fetch;
};

// Pagination walks unconditionally up to MAX_PAGES (or until a short page
// signals exhaustion). Stopping early when a page contained a known id would
// break the bot's "post failures retry on the next run" property: once newer
// events fill page 1, the failed older event sits on page 2 and an early
// stop would leave it permanently unposted.
export async function fetchFukuokaLatestEvents(
  apiKey: string,
  options: FetchOptions = {},
): Promise<ConnpassEvent[]> {
  const { fetchImpl = fetch } = options;
  const all: ConnpassEvent[] = [];

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const start = pageIndex * MAX_EVENTS_PER_PAGE + 1;
    // oxlint-disable-next-line no-await-in-loop
    const { events, rawCount } = await fetchPage(apiKey, start, fetchImpl);
    all.push(...events);

    // Use the raw response count, not the parsed count: a single malformed
    // event in an otherwise full page would short-circuit pagination and
    // silently drop later pages.
    if (rawCount < MAX_EVENTS_PER_PAGE) break;
  }

  return all;
}

async function fetchPage(
  apiKey: string,
  start: number,
  fetchImpl: typeof fetch,
): Promise<ParsedEventsPage> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("prefecture", "fukuoka");
  url.searchParams.set("order", ORDER_NEWEST);
  url.searchParams.set("count", String(MAX_EVENTS_PER_PAGE));
  url.searchParams.set("start", String(start));

  const res = await fetchImpl(url, {
    headers: { "X-API-Key": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`connpass API request failed: ${res.status} ${res.statusText}`);
  }

  return parseEvents(await res.json());
}
