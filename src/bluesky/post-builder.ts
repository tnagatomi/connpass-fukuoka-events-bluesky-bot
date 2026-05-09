import { AppBskyRichtextFacet, UnicodeString } from "@atproto/api";
import type { ConnpassEvent } from "../connpass/types.ts";
import { formatJpDateTime } from "../format/datetime.ts";

const MAX_GRAPHEMES = 300;
const ELLIPSIS = "…";
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export type BuiltPost = {
  text: string;
  facets: AppBskyRichtextFacet.Main[];
};

function sliceGraphemes(str: string, max: number): string {
  if (max <= 0) return "";
  const out: string[] = [];
  for (const { segment } of segmenter.segment(str)) {
    if (out.length === max) return out.join("");
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
  if (unicode.graphemeLength > MAX_GRAPHEMES) {
    const titleGraphemes = new UnicodeString(title).graphemeLength;
    const overhead = unicode.graphemeLength - titleGraphemes;
    const maxTitleGraphemes = MAX_GRAPHEMES - overhead - 1;
    if (maxTitleGraphemes >= 0) {
      title = sliceGraphemes(title, maxTitleGraphemes) + ELLIPSIS;
    } else if (place) {
      // Even an empty title can't bring overhead under MAX. Drop title to
      // just the ellipsis and truncate place to fit the remaining budget.
      title = ELLIPSIS;
      const placeGraphemes = new UnicodeString(place).graphemeLength;
      // overhead excludes the original title; replacing it with ELLIPSIS adds 1.
      const fixedOverhead = overhead - placeGraphemes + 1;
      const maxPlaceGraphemes = MAX_GRAPHEMES - fixedOverhead - 1;
      place = sliceGraphemes(place, Math.max(0, maxPlaceGraphemes)) + ELLIPSIS;
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
