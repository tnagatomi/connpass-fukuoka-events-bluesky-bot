const EXTRACT_ENDPOINT = "https://cardyb.bsky.app/v1/extract";
const TIMEOUT_MS = 10_000;

export type CardybExtract = {
  title: string;
  description: string;
  image: string;
};

type CardybResponse = {
  error?: string;
  title?: string;
  description?: string;
  image?: string;
};

export async function extractCardyb(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CardybExtract | null> {
  const requestUrl = new URL(EXTRACT_ENDPOINT);
  requestUrl.searchParams.set("url", url);

  try {
    const res = await fetchImpl(requestUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const data = (await res.json()) as CardybResponse;
    if (data.error) return null;
    // The cast above is a lie — `res.json()` returns unknown shapes. A
    // non-string description or image leaking through would later fail
    // AtProto's external embed validation, so coerce per-field here.
    return {
      title: typeof data.title === "string" ? data.title : "",
      description: typeof data.description === "string" ? data.description : "",
      image: typeof data.image === "string" ? data.image : "",
    };
  } catch {
    return null;
  }
}
