import type { AppBskyEmbedExternal, BlobRef } from "@atproto/api";
import type { ConnpassEvent } from "../connpass/types.ts";
import { extractCardyb } from "./cardyb.ts";

const MAX_THUMB_BYTES = 1_000_000;
const IMAGE_TIMEOUT_MS = 10_000;

export type ExternalCard = AppBskyEmbedExternal.External;

export type BlobUploader = {
  uploadBlob(data: Uint8Array, opts: { encoding: string }): Promise<{ data: { blob: BlobRef } }>;
};

export async function buildExternalCard(
  agent: BlobUploader,
  event: ConnpassEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalCard> {
  const extract = await extractCardyb(event.url, fetchImpl);
  if (!extract) {
    return { uri: event.url, title: event.title, description: "" };
  }

  const card: ExternalCard = {
    uri: event.url,
    title: event.title,
    description: extract.description,
  };

  if (!extract.image) return card;

  try {
    const imageUrl = new URL(extract.image);
    if (imageUrl.protocol !== "https:") return card;

    const res = await fetchImpl(extract.image, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return card;
    }
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!mime.startsWith("image/")) {
      await res.body?.cancel();
      return card;
    }

    const buf = await readWithCap(res, MAX_THUMB_BYTES);
    if (!buf) return card;

    const upload = await agent.uploadBlob(buf, { encoding: mime });
    return { ...card, thumb: upload.data.blob };
  } catch {
    return card;
  }
}

async function readWithCap(res: Response, cap: number): Promise<Uint8Array | null> {
  if (!res.body) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.byteLength;
    if (total > cap) return null;
    chunks.push(chunk);
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buf;
}
