import type { ConnpassEvent, EventsResponse } from "./types.ts";

const ENDPOINT = "https://connpass.com/api/v2/events/";
const ORDER_NEWEST = "3";
const TIMEOUT_MS = 10_000;

// connpass API caps `count` at 100 per request. Reusing this as the dedupe
// window size in posted-events.ts ensures we never forget an id we could still
// see in a future fetch.
export const MAX_EVENTS_PER_PAGE = 100;

export async function fetchFukuokaLatestEvents(
  apiKey: string,
  count: number = MAX_EVENTS_PER_PAGE,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnpassEvent[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("prefecture", "fukuoka");
  url.searchParams.set("order", ORDER_NEWEST);
  url.searchParams.set("count", String(count));

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
