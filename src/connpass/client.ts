import type { ConnpassEvent, EventsResponse } from "./types.ts";

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
  // Stop paginating once a fetched page contains any of these ids. The bot
  // passes its dedupe state so a caught-up run only hits page 1.
  knownIds?: ReadonlySet<number>;
  fetchImpl?: typeof fetch;
};

export async function fetchFukuokaLatestEvents(
  apiKey: string,
  options: FetchOptions = {},
): Promise<ConnpassEvent[]> {
  const { knownIds, fetchImpl = fetch } = options;
  const all: ConnpassEvent[] = [];

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const start = pageIndex * MAX_EVENTS_PER_PAGE + 1;
    // oxlint-disable-next-line no-await-in-loop
    const page = await fetchPage(apiKey, start, fetchImpl);
    all.push(...page);

    if (page.length < MAX_EVENTS_PER_PAGE) break;
    if (knownIds && page.some((e) => knownIds.has(e.id))) break;
  }

  return all;
}

async function fetchPage(
  apiKey: string,
  start: number,
  fetchImpl: typeof fetch,
): Promise<ConnpassEvent[]> {
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

  const data = (await res.json()) as EventsResponse;
  return data.events;
}
