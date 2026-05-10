import type { BlobRef } from "@atproto/api";
import { describe, expect, test, vi } from "vitest";
import { type Poster, createBlueskyClient } from "./client.ts";
import type { PostSearcher } from "./lookup.ts";
import type { ConnpassEvent } from "../connpass/types.ts";

vi.mock("./ogp.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ogp.ts")>();
  return {
    ...actual,
    buildExternalCard: vi.fn(async (_agent, event) => ({
      uri: event.url,
      title: event.title,
      description: "",
    })),
  };
});

const fakeBlobRef = { mimeType: "image/jpeg", size: 100 } as unknown as BlobRef;

const author = "bot.bsky.social";

const event: ConnpassEvent = {
  id: 1,
  title: "Fukuoka.go #5",
  catch: "An evening of Go",
  description: null,
  url: "https://connpass.com/event/12345/",
  image_url: null,
  started_at: "2026-05-15T19:00:00+09:00",
  ended_at: null,
  address: null,
  place: "天神",
  group: null,
  event_type: "participation",
  open_status: "open",
};

const matchingPost = {
  uri: "at://did:plc:bot/app.bsky.feed.post/abc",
  cid: "bafy",
  record: { $type: "app.bsky.feed.post", text: `Fukuoka.go #5\n\n${event.url}` },
};

function makePoster(searchPostsImpl: ReturnType<typeof vi.fn>): {
  agent: Poster;
  post: ReturnType<typeof vi.fn>;
  uploadBlob: ReturnType<typeof vi.fn>;
  searchPosts: ReturnType<typeof vi.fn>;
} {
  const post = vi.fn().mockResolvedValue({});
  const uploadBlob = vi.fn().mockResolvedValue({ data: { blob: fakeBlobRef } });
  const feed: PostSearcher = {
    searchPosts: searchPostsImpl as unknown as PostSearcher["searchPosts"],
  };
  return {
    agent: { post, uploadBlob, app: { bsky: { feed } } },
    post,
    uploadBlob,
    searchPosts: searchPostsImpl,
  };
}

const noExistingPosts = () => vi.fn().mockResolvedValue({ data: { posts: [] } });
const existingPost = () => vi.fn().mockResolvedValue({ data: { posts: [matchingPost] } });

describe("createBlueskyClient.postEvent", () => {
  test("posts text, facets, external embed, and createdAt and returns 'posted'", async () => {
    const { agent, post } = makePoster(noExistingPosts());
    const client = createBlueskyClient(agent, author);

    expect(await client.postEvent(event)).toBe("posted");

    expect(post).toHaveBeenCalledTimes(1);
    const record = post.mock.calls[0]![0] as {
      text: string;
      facets: unknown[];
      embed: { $type: string; external: { uri: string; title: string } };
      createdAt: string;
    };
    expect(record.text).toContain("Fukuoka.go #5");
    expect(record.text).toContain(event.url);
    expect(record.facets).toHaveLength(1);
    expect(record.embed.$type).toBe("app.bsky.embed.external");
    expect(record.embed.external.uri).toBe(event.url);
    expect(record.embed.external.title).toBe("Fukuoka.go #5");
    expect(() => new Date(record.createdAt).toISOString()).not.toThrow();
  });

  test("returns 'already_present' and skips agent.post when a matching post exists", async () => {
    const { agent, post } = makePoster(existingPost());
    const client = createBlueskyClient(agent, author);

    expect(await client.postEvent(event)).toBe("already_present");
    expect(post).not.toHaveBeenCalled();
  });

  test("returns 'already_present' when post fails but a recheck finds the post landed", async () => {
    // Pre-check: not found. Recheck after the post() rejection: found.
    const searchPosts = vi
      .fn()
      .mockResolvedValueOnce({ data: { posts: [] } })
      .mockResolvedValueOnce({ data: { posts: [matchingPost] } });
    const { agent, post } = makePoster(searchPosts);
    post.mockRejectedValueOnce(new Error("timeout"));
    const client = createBlueskyClient(agent, author);

    expect(await client.postEvent(event)).toBe("already_present");
    expect(post).toHaveBeenCalledTimes(1);
    expect(searchPosts).toHaveBeenCalledTimes(2);
  });

  test("returns 'failed' when post fails and the recheck does not find the post", async () => {
    const searchPosts = vi.fn().mockResolvedValue({ data: { posts: [] } });
    const { agent, post } = makePoster(searchPosts);
    post.mockRejectedValueOnce(new Error("boom"));
    const client = createBlueskyClient(agent, author);

    expect(await client.postEvent(event)).toBe("failed");
    expect(searchPosts).toHaveBeenCalledTimes(2);
  });

  test("returns 'failed' when post fails and the recheck itself fails (uncertain → do not record)", async () => {
    const searchPosts = vi
      .fn()
      .mockResolvedValueOnce({ data: { posts: [] } })
      .mockRejectedValueOnce(new Error("search down"));
    const { agent, post } = makePoster(searchPosts);
    post.mockRejectedValueOnce(new Error("boom"));
    const client = createBlueskyClient(agent, author);

    expect(await client.postEvent(event)).toBe("failed");
  });

  test("attempts to post when the pre-check itself fails (best-effort)", async () => {
    // A pre-check failure must not block posting; it just degrades to the
    // unconditional behavior we had before adding idempotency.
    const searchPosts = vi
      .fn()
      .mockRejectedValueOnce(new Error("search down"))
      .mockResolvedValueOnce({ data: { posts: [] } });
    const { agent, post } = makePoster(searchPosts);
    const client = createBlueskyClient(agent, author);

    expect(await client.postEvent(event)).toBe("posted");
    expect(post).toHaveBeenCalledTimes(1);
  });
});
