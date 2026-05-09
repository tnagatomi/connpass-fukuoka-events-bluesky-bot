import { describe, expect, test, vi } from "vitest";
import { extractCardyb } from "./cardyb.ts";

const SAMPLE_URL = "https://engineercafe.connpass.com/event/382433/";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function emptyOk(): Response {
  return jsonResponse({ error: "", title: "", description: "", image: "" });
}

describe("extractCardyb", () => {
  test("returns title/description/image when extract succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        error: "",
        title: "Event title",
        description: "Event description",
        image: "https://cardyb.bsky.app/v1/image?url=https%3A%2F%2Fexample.com%2Fimg.png",
      }),
    );

    const result = await extractCardyb(SAMPLE_URL, fetchMock);

    expect(result).toEqual({
      title: "Event title",
      description: "Event description",
      image: "https://cardyb.bsky.app/v1/image?url=https%3A%2F%2Fexample.com%2Fimg.png",
    });
  });

  test("passes the target url as a query parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyOk());

    await extractCardyb(SAMPLE_URL, fetchMock);

    const calledUrl = fetchMock.mock.calls[0]![0] as URL;
    expect(calledUrl.toString()).toBe(
      `https://cardyb.bsky.app/v1/extract?url=${encodeURIComponent(SAMPLE_URL)}`,
    );
  });

  test("defaults missing fields to empty strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));

    const result = await extractCardyb(SAMPLE_URL, fetchMock);

    expect(result).toEqual({ title: "", description: "", image: "" });
  });

  test("returns null when the extract response has a non-empty error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "could not fetch", title: "", image: "" }));

    const result = await extractCardyb(SAMPLE_URL, fetchMock);

    expect(result).toBeNull();
  });

  test("returns null and cancels the body when the response is non-ok", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const res = new Response(null, { status: 502, statusText: "Bad Gateway" });
    Object.defineProperty(res, "body", { value: { cancel } });
    const fetchMock = vi.fn().mockResolvedValue(res);

    const result = await extractCardyb(SAMPLE_URL, fetchMock);

    expect(result).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("returns null when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await extractCardyb(SAMPLE_URL, fetchMock);

    expect(result).toBeNull();
  });
});
