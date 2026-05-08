import type { AppBskyEmbedExternal, BlobRef } from "@atproto/api";
import type { ConnpassEvent } from "../connpass/types.ts";

const MAX_THUMB_BYTES = 1_000_000;

export type ExternalCard = AppBskyEmbedExternal.External;

export type BlobUploader = {
  uploadBlob(data: Uint8Array, opts: { encoding: string }): Promise<{ data: { blob: BlobRef } }>;
};

export async function buildExternalCard(
  agent: BlobUploader,
  event: ConnpassEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalCard> {
  const card: ExternalCard = {
    uri: event.url,
    title: event.title,
    description: event.catch ?? event.place ?? "",
  };

  if (!event.image_url) return card;

  try {
    const res = await fetchImpl(event.image_url);
    if (!res.ok) {
      await res.body?.cancel();
      return card;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_THUMB_BYTES) return card;

    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const upload = await agent.uploadBlob(buf, { encoding: mime });
    return { ...card, thumb: upload.data.blob };
  } catch {
    return card;
  }
}
