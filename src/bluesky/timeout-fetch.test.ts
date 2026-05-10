import { describe, expect, test, vi } from "vitest";
import { withTimeoutFetch } from "./timeout-fetch.ts";

function abortableFetch(): typeof globalThis.fetch {
  return vi.fn((_input: unknown, init?: RequestInit) => {
    return new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(init.signal!.reason);
      });
    });
  }) as unknown as typeof globalThis.fetch;
}

describe("withTimeoutFetch", () => {
  test("forwards input/init and returns the underlying response", async () => {
    const response = new Response("ok");
    const underlying = vi.fn().mockResolvedValue(response);

    const wrapped = withTimeoutFetch(underlying, 10_000);
    const result = await wrapped("https://example.test/", { method: "POST" });

    expect(result).toBe(response);
    expect(underlying).toHaveBeenCalledTimes(1);
    const [input, init] = underlying.mock.calls[0]!;
    expect(input).toBe("https://example.test/");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("aborts the underlying fetch when the timeout elapses", async () => {
    const wrapped = withTimeoutFetch(abortableFetch(), 5);
    await expect(wrapped("https://example.test/")).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  test("aborts when a caller-supplied signal aborts before the timeout", async () => {
    const controller = new AbortController();
    const wrapped = withTimeoutFetch(abortableFetch(), 60_000);
    const pending = wrapped("https://example.test/", { signal: controller.signal });
    controller.abort(new Error("caller cancelled"));

    await expect(pending).rejects.toThrow("caller cancelled");
  });
});
