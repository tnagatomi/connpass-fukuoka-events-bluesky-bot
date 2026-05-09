import type { BlobRef } from "@atproto/api";
import { describe, expect, test, vi } from "vitest";
import { type BlobUploader, buildExternalCard } from "./ogp.ts";
import type { ConnpassEvent } from "../connpass/types.ts";

const fakeBlobRef = { mimeType: "image/jpeg", size: 100 } as unknown as BlobRef;

const baseEvent: ConnpassEvent = {
  id: 1,
  title: "Fukuoka.go #5",
  catch: "An evening of Go in Fukuoka",
  description: null,
  url: "https://connpass.com/event/12345/",
  image_url: "https://connpass-img.example/12345.jpg",
  started_at: "2026-05-15T19:00:00+09:00",
  ended_at: null,
  address: null,
  place: null,
  group: null,
  event_type: "participation",
  open_status: "open",
};

const cardybImageUrl = "https://cardyb.bsky.app/v1/image?url=https%3A%2F%2Fexample.com%2Fcover.png";

function cardybOk(
  overrides: { title?: string; description?: string; image?: string } = {},
): Response {
  return new Response(
    JSON.stringify({
      error: "",
      title: "Fukuoka.go #5 (2026/05/15 19:00〜)",
      description: "An OG description from connpass page",
      image: cardybImageUrl,
      ...overrides,
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function imageOk(
  bytes: Uint8Array = new Uint8Array([1, 2, 3]),
  contentType: string = "image/jpeg",
): Response {
  return new Response(bytes, {
    headers: { "content-type": contentType },
  });
}

function makeAgent(blob: BlobRef = fakeBlobRef): {
  agent: BlobUploader;
  uploadBlob: ReturnType<typeof vi.fn>;
} {
  const uploadBlob = vi.fn().mockResolvedValue({ data: { blob } });
  return { agent: { uploadBlob }, uploadBlob };
}

describe("buildExternalCard", () => {
  test("uses event.url as uri and event.title as title even when cardyb returns its own title", async () => {
    const { agent } = makeAgent();
    const fetchMock = vi.fn().mockResolvedValueOnce(cardybOk()).mockResolvedValueOnce(imageOk());

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.uri).toBe(baseEvent.url);
    expect(card.title).toBe(baseEvent.title);
  });

  test("uses cardyb description when extract succeeds", async () => {
    const { agent } = makeAgent();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(cardybOk({ description: "イベント概要" }))
      .mockResolvedValueOnce(imageOk());

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.description).toBe("イベント概要");
  });

  test("uploads cardyb image and attaches thumb when both fetches succeed", async () => {
    const { agent, uploadBlob } = makeAgent();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(cardybOk())
      .mockResolvedValueOnce(imageOk(bytes, "image/png"));

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(fetchMock.mock.calls[1]![0]).toBe(cardybImageUrl);
    const [data, opts] = uploadBlob.mock.calls[0]!;
    expect(data).toEqual(bytes);
    expect(opts).toEqual({ encoding: "image/png" });
    expect(card.thumb).toBe(fakeBlobRef);
  });

  test("returns minimal card with empty description when cardyb extract fails", async () => {
    const { agent, uploadBlob } = makeAgent();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 502, statusText: "Bad Gateway" }));

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card).toEqual({
      uri: baseEvent.url,
      title: baseEvent.title,
      description: "",
    });
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("omits thumb when image URL is not https", async () => {
    const { agent, uploadBlob } = makeAgent();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(cardybOk({ image: "http://example.com/cover.png" }));

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("returns card without thumb when cardyb image is empty", async () => {
    const { agent, uploadBlob } = makeAgent();
    const fetchMock = vi.fn().mockResolvedValueOnce(cardybOk({ image: "" }));

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
    expect(card.description).toBe("An OG description from connpass page");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("defaults mime to image/jpeg when content-type header is missing", async () => {
    const { agent, uploadBlob } = makeAgent();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(cardybOk())
      .mockResolvedValueOnce(new Response(new Uint8Array([1])));

    await buildExternalCard(agent, baseEvent, fetchMock);

    expect(uploadBlob.mock.calls[0]![1]).toEqual({ encoding: "image/jpeg" });
  });

  test("omits thumb when image is larger than 1 MB", async () => {
    const { agent, uploadBlob } = makeAgent();
    const big = new Uint8Array(1_000_001);
    const fetchMock = vi.fn().mockResolvedValueOnce(cardybOk()).mockResolvedValueOnce(imageOk(big));

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("cancels response body and omits thumb when image fetch returns non-ok", async () => {
    const { agent, uploadBlob } = makeAgent();
    const cancel = vi.fn().mockResolvedValue(undefined);
    const imageRes = new Response(null, { status: 404, statusText: "Not Found" });
    Object.defineProperty(imageRes, "body", { value: { cancel } });
    const fetchMock = vi.fn().mockResolvedValueOnce(cardybOk()).mockResolvedValueOnce(imageRes);

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("omits thumb when image fetch throws", async () => {
    const { agent, uploadBlob } = makeAgent();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(cardybOk())
      .mockRejectedValueOnce(new Error("network down"));

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
    expect(card.description).toBe("An OG description from connpass page");
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("omits thumb when uploadBlob throws", async () => {
    const uploadBlob = vi.fn().mockRejectedValue(new Error("upload failed"));
    const agent: BlobUploader = { uploadBlob };
    const fetchMock = vi.fn().mockResolvedValueOnce(cardybOk()).mockResolvedValueOnce(imageOk());

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
  });

  test("calls cardyb with the connpass event url", async () => {
    const { agent } = makeAgent();
    const fetchMock = vi.fn().mockResolvedValueOnce(cardybOk()).mockResolvedValueOnce(imageOk());

    await buildExternalCard(agent, baseEvent, fetchMock);

    const cardybCall = fetchMock.mock.calls[0]![0] as URL;
    expect(cardybCall.toString()).toBe(
      `https://cardyb.bsky.app/v1/extract?url=${encodeURIComponent(baseEvent.url)}`,
    );
  });
});
