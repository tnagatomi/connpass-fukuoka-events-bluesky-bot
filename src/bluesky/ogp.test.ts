import type { BlobRef } from "@atproto/api";
import { describe, expect, test, vi } from "vitest";
import { type BlobUploader, buildExternalCard } from "./ogp.js";
import type { ConnpassEvent } from "../connpass/types.js";

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

function makeAgent(blob: BlobRef = fakeBlobRef): {
  agent: BlobUploader;
  uploadBlob: ReturnType<typeof vi.fn>;
} {
  const uploadBlob = vi.fn().mockResolvedValue({ data: { blob } });
  return { agent: { uploadBlob }, uploadBlob };
}

describe("buildExternalCard", () => {
  test("uses event.url as uri and event.title as title", async () => {
    const { agent } = makeAgent();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/jpeg" },
      }),
    );

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.uri).toBe("https://connpass.com/event/12345/");
    expect(card.title).toBe("Fukuoka.go #5");
  });

  test("uses event.catch as description when set", async () => {
    const { agent } = makeAgent();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }),
      );

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.description).toBe("An evening of Go in Fukuoka");
  });

  test("falls back to event.place when catch is null", async () => {
    const { agent } = makeAgent();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }),
      );

    const card = await buildExternalCard(
      agent,
      { ...baseEvent, catch: null, place: "天神" },
      fetchMock,
    );

    expect(card.description).toBe("天神");
  });

  test("uses empty description when catch and place are both null", async () => {
    const { agent } = makeAgent();
    const card = await buildExternalCard(
      agent,
      { ...baseEvent, image_url: null, catch: null, place: null },
      vi.fn(),
    );

    expect(card.description).toBe("");
  });

  test("returns card without thumb when image_url is null", async () => {
    const { agent, uploadBlob } = makeAgent();
    const fetchMock = vi.fn();

    const card = await buildExternalCard(agent, { ...baseEvent, image_url: null }, fetchMock);

    expect(card.thumb).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("uploads image and attaches thumb when fetch succeeds", async () => {
    const { agent, uploadBlob } = makeAgent();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(bytes, { headers: { "content-type": "image/png" } }));

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(baseEvent.image_url);
    expect(uploadBlob).toHaveBeenCalledTimes(1);
    const [data, opts] = uploadBlob.mock.calls[0]!;
    expect(data).toEqual(bytes);
    expect(opts).toEqual({ encoding: "image/png" });
    expect(card.thumb).toBe(fakeBlobRef);
  });

  test("defaults mime to image/jpeg when content-type header is missing", async () => {
    const { agent, uploadBlob } = makeAgent();
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { headers: {} }));

    await buildExternalCard(agent, baseEvent, fetchMock);

    expect(uploadBlob.mock.calls[0]![1]).toEqual({ encoding: "image/jpeg" });
  });

  test("omits thumb when image is larger than 1 MB", async () => {
    const { agent, uploadBlob } = makeAgent();
    const big = new Uint8Array(1_000_001);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(big, { headers: { "content-type": "image/jpeg" } }));

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("cancels response body and omits thumb when image fetch returns non-ok", async () => {
    const { agent, uploadBlob } = makeAgent();
    const cancel = vi.fn().mockResolvedValue(undefined);
    const res = new Response(null, { status: 404, statusText: "Not Found" });
    Object.defineProperty(res, "body", { value: { cancel } });
    const fetchMock = vi.fn().mockResolvedValue(res);

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("omits thumb when image fetch throws", async () => {
    const { agent, uploadBlob } = makeAgent();
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  test("omits thumb when uploadBlob throws", async () => {
    const uploadBlob = vi.fn().mockRejectedValue(new Error("upload failed"));
    const agent: BlobUploader = { uploadBlob };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }),
      );

    const card = await buildExternalCard(agent, baseEvent, fetchMock);

    expect(card.thumb).toBeUndefined();
  });
});
