import type { Agent } from "@atproto/api";

export type LookupResult = "found" | "not_found" | "search_failed";

// Best-effort idempotency probe: a hit means we are confident enough to skip
// re-posting; a miss or error must NOT be treated as confirmed-missing — the
// caller falls back to "do not record state, retry next run".
export type PostSearcher = Pick<Agent["app"]["bsky"]["feed"], "searchPosts">;

const SEARCH_TIMEOUT_MS = 10_000;
const SEARCH_LIMIT = 10;

export async function findExistingEventPost(
  searcher: PostSearcher,
  author: string,
  eventUrl: string,
): Promise<LookupResult> {
  try {
    const res = await searcher.searchPosts(
      { q: eventUrl, url: eventUrl, author, sort: "latest", limit: SEARCH_LIMIT },
      { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
    );
    // The `url` filter applies normalization/fuzzy matching server-side, so
    // verify the event URL is literally in the post text before declaring a
    // match. False positives here mean we silently drop a real event.
    return res.data.posts.some((p) => recordContainsUrl(p.record, eventUrl))
      ? "found"
      : "not_found";
  } catch {
    return "search_failed";
  }
}

function recordContainsUrl(record: unknown, url: string): boolean {
  if (typeof record !== "object" || record === null) return false;
  const text = (record as { text?: unknown }).text;
  return typeof text === "string" && text.includes(url);
}
