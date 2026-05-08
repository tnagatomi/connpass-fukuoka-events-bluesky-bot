import type { BlobRef } from "@atproto/api";
import { describe, expect, test, vi } from "vitest";
import { type Poster, createBlueskyClient } from "./client.js";
import type { ConnpassEvent } from "../connpass/types.js";

const fakeBlobRef = { mimeType: "image/jpeg", size: 100 } as unknown as BlobRef;

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

function makePoster(): {
  agent: Poster;
  post: ReturnType<typeof vi.fn>;
  uploadBlob: ReturnType<typeof vi.fn>;
} {
  const post = vi.fn().mockResolvedValue({});
  const uploadBlob = vi.fn().mockResolvedValue({ data: { blob: fakeBlobRef } });
  return { agent: { post, uploadBlob }, post, uploadBlob };
}

describe("createBlueskyClient.postEvent", () => {
  test("posts text, facets, external embed, and createdAt", async () => {
    const { agent, post } = makePoster();
    const client = createBlueskyClient(agent);

    await client.postEvent(event);

    expect(post).toHaveBeenCalledTimes(1);
    const record = post.mock.calls[0]![0] as {
      text: string;
      facets: unknown[];
      embed: { $type: string; external: { uri: string; title: string } };
      createdAt: string;
    };
    expect(record.text).toContain("Fukuoka.go #5");
    expect(record.text).toContain("https://connpass.com/event/12345/");
    expect(record.facets).toHaveLength(1);
    expect(record.embed.$type).toBe("app.bsky.embed.external");
    expect(record.embed.external.uri).toBe("https://connpass.com/event/12345/");
    expect(record.embed.external.title).toBe("Fukuoka.go #5");
    expect(() => new Date(record.createdAt).toISOString()).not.toThrow();
  });

  test("propagates errors from agent.post", async () => {
    const { agent, post } = makePoster();
    post.mockRejectedValueOnce(new Error("boom"));
    const client = createBlueskyClient(agent);

    await expect(client.postEvent(event)).rejects.toThrow("boom");
  });
});
