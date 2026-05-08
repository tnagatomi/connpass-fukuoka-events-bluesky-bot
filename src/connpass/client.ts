import type { ConnpassEvent, EventsResponse } from "./types.js";

const ENDPOINT = "https://connpass.com/api/v2/events/";
const ORDER_NEWEST = "3";

export async function fetchFukuokaLatestEvents(
  apiKey: string,
  count = 100,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnpassEvent[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("prefecture", "fukuoka");
  url.searchParams.set("order", ORDER_NEWEST);
  url.searchParams.set("count", String(count));

  const res = await fetchImpl(url, {
    headers: { "X-API-Key": apiKey },
  });

  if (!res.ok) {
    throw new Error(`connpass API request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as EventsResponse;
  return data.events;
}
