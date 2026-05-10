import { AppBskyRichtextFacet, UnicodeString } from "@atproto/api";
import type { ConnpassEvent } from "../connpass/types.ts";
import { formatJpDateTime } from "../format/datetime.ts";

// AtProto post text caps both maxGraphemes (300) and maxLength (3000 UTF-8
// bytes). A 25-byte ZWJ family emoji can stay under 300 graphemes while
// blowing past 3000 bytes, so both axes must be enforced.
const MAX_GRAPHEMES = 300;
const MAX_BYTES = 3000;
const ELLIPSIS = "…";
const ELLIPSIS_BYTES = new UnicodeString(ELLIPSIS).utf8.byteLength;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export type BuiltPost = {
  text: string;
  facets: AppBskyRichtextFacet.Main[];
};

function sliceToBudget(str: string, maxGraphemes: number, maxBytes: number): string {
  if (maxGraphemes <= 0 || maxBytes <= 0) return "";
  const out: string[] = [];
  let bytes = 0;
  for (const { segment } of segmenter.segment(str)) {
    if (out.length === maxGraphemes) return out.join("");
    const segBytes = new UnicodeString(segment).utf8.byteLength;
    if (bytes + segBytes > maxBytes) return out.join("");
    bytes += segBytes;
    out.push(segment);
  }
  return str;
}

export function buildPost(event: ConnpassEvent): BuiltPost {
  const link = event.url;
  let title = event.title;
  let place = event.place ?? event.address;

  const compose = (): string => {
    const lines: string[] = [title, ""];
    if (event.started_at) {
      lines.push(`📅 ${formatJpDateTime(event.started_at)}`);
    }
    if (place) {
      lines.push(`📍 ${place}`);
    }
    lines.push("", link);
    return lines.join("\n");
  };

  let text = compose();
  let unicode = new UnicodeString(text);
  if (unicode.graphemeLength > MAX_GRAPHEMES || unicode.utf8.byteLength > MAX_BYTES) {
    const titleUni = new UnicodeString(title);
    const overheadGraphemes = unicode.graphemeLength - titleUni.graphemeLength;
    const overheadBytes = unicode.utf8.byteLength - titleUni.utf8.byteLength;
    const titleGraphemeBudget = MAX_GRAPHEMES - overheadGraphemes - 1;
    const titleByteBudget = MAX_BYTES - overheadBytes - ELLIPSIS_BYTES;
    if (titleGraphemeBudget >= 0 && titleByteBudget >= 0) {
      title = sliceToBudget(title, titleGraphemeBudget, titleByteBudget) + ELLIPSIS;
    } else if (place) {
      // Even an empty title can't bring overhead under MAX. Drop title to
      // just the ellipsis and truncate place to fit the remaining budget.
      title = ELLIPSIS;
      const placeUni = new UnicodeString(place);
      // overhead excludes the original title; replacing it with ELLIPSIS adds
      // 1 grapheme and ELLIPSIS_BYTES bytes.
      const fixedOverheadGraphemes = overheadGraphemes - placeUni.graphemeLength + 1;
      const fixedOverheadBytes = overheadBytes - placeUni.utf8.byteLength + ELLIPSIS_BYTES;
      const placeGraphemeBudget = MAX_GRAPHEMES - fixedOverheadGraphemes - 1;
      const placeByteBudget = MAX_BYTES - fixedOverheadBytes - ELLIPSIS_BYTES;
      place =
        sliceToBudget(place, Math.max(0, placeGraphemeBudget), Math.max(0, placeByteBudget)) +
        ELLIPSIS;
    }
    text = compose();
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
