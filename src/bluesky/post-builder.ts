import { AppBskyRichtextFacet, UnicodeString } from "@atproto/api";
import type { ConnpassEvent } from "../connpass/types.js";
import { formatJpDateTime } from "../format/datetime.js";

const MAX_GRAPHEMES = 300;
const ELLIPSIS = "…";

export type BuiltPost = {
  text: string;
  facets: AppBskyRichtextFacet.Main[];
};

export function buildPost(event: ConnpassEvent): BuiltPost {
  const link = event.url;
  const lines: string[] = [event.title, ""];
  if (event.started_at) {
    lines.push(`📅 ${formatJpDateTime(event.started_at)}`);
  }
  const place = event.place ?? event.address;
  if (place) {
    lines.push(`📍 ${place}`);
  }
  lines.push("", link);

  let text = lines.join("\n");
  let unicode = new UnicodeString(text);
  if (unicode.graphemeLength > MAX_GRAPHEMES) {
    const titleGraphemes = new UnicodeString(event.title).graphemeLength;
    const overhead = unicode.graphemeLength - titleGraphemes;
    const maxTitleGraphemes = MAX_GRAPHEMES - overhead - 1;
    lines[0] = event.title.slice(0, Math.max(0, maxTitleGraphemes)) + ELLIPSIS;
    text = lines.join("\n");
    unicode = new UnicodeString(text);
  }

  const linkStartUtf16 = text.length - link.length;
  return {
    text,
    facets: [
      {
        index: {
          byteStart: unicode.utf16IndexToUtf8Index(linkStartUtf16),
          byteEnd: unicode.utf8.byteLength,
        },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: link }],
      },
    ],
  };
}
