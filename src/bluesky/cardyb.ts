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
    return {
      title: data.title ?? "",
      description: data.description ?? "",
      image: data.image ?? "",
    };
  } catch {
    return null;
  }
}
