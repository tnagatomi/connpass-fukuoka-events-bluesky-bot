import { describe, expect, test, vi } from "vitest";
import { findExistingEventPost, type PostSearcher } from "./lookup.ts";

const url = "https://connpass.com/event/12345/";
const author = "bot.bsky.social";

const post = (text: string) => ({
  uri: "at://did:plc:bot/app.bsky.feed.post/abc",
  cid: "bafy",
  record: { $type: "app.bsky.feed.post", text },
});

const searcherWith = (posts: ReturnType<typeof post>[]): PostSearcher => ({
  searchPosts: vi.fn().mockResolvedValue({ data: { posts } }),
});

describe("findExistingEventPost", () => {
  test("returns 'found' when a returned post's text contains the event URL", async () => {
    const searcher = searcherWith([post(`title\n\n📅 ...\n\n${url}`)]);
    expect(await findExistingEventPost(searcher, author, url)).toBe("found");
  });

  test("returns 'not_found' when the search returns zero posts", async () => {
    const searcher = searcherWith([]);
    expect(await findExistingEventPost(searcher, author, url)).toBe("not_found");
  });

  test("returns 'not_found' when returned posts do not literally contain the URL", async () => {
    // Guard against the server's url filter doing fuzzy/normalized matching:
    // a returned post that mentions a sibling event must not count as a hit.
    const searcher = searcherWith([post("https://connpass.com/event/99999/")]);
    expect(await findExistingEventPost(searcher, author, url)).toBe("not_found");
  });

  test("returns 'search_failed' when the searchPosts call rejects", async () => {
    const searcher: PostSearcher = {
      searchPosts: vi.fn().mockRejectedValue(new Error("boom")),
    };
    expect(await findExistingEventPost(searcher, author, url)).toBe("search_failed");
  });

  test("forwards author, q, url, sort, and limit to searchPosts", async () => {
    const searcher = searcherWith([]);
    await findExistingEventPost(searcher, author, url);
    expect(searcher.searchPosts).toHaveBeenCalledWith(
      { q: url, url, author, sort: "latest", limit: 10 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
