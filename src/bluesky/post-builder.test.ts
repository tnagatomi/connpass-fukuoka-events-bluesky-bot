import { UnicodeString } from "@atproto/api";
import { describe, expect, test } from "vitest";
import { buildPost } from "./post-builder.ts";
import type { ConnpassEvent } from "../connpass/types.ts";

const ELLIPSIS = "…";

const baseEvent: ConnpassEvent = {
  id: 1,
  title: "Fukuoka.go #5",
  catch: null,
  description: null,
  url: "https://connpass.com/event/12345/",
  image_url: null,
  started_at: "2026-05-15T19:00:00+09:00",
  ended_at: null,
  address: null,
  place: null,
  group: null,
  event_type: "participation",
  open_status: "open",
};

describe("buildPost", () => {
  test("formats title, date, place, blank line, URL", () => {
    const result = buildPost({ ...baseEvent, place: "福岡市中央区天神" });
    expect(result.text).toBe(
      "Fukuoka.go #5\n\n📅 2026年5月15日(金) 19:00〜\n📍 福岡市中央区天神\n\nhttps://connpass.com/event/12345/",
    );
  });

  test("falls back to address when place is null", () => {
    const result = buildPost({
      ...baseEvent,
      address: "福岡県福岡市中央区天神1-1-1",
    });
    expect(result.text).toContain("📍 福岡県福岡市中央区天神1-1-1");
  });

  test("prefers place over address when both are set", () => {
    const result = buildPost({
      ...baseEvent,
      place: "place value",
      address: "address value",
    });
    expect(result.text).toContain("📍 place value");
    expect(result.text).not.toContain("address value");
  });

  test("omits the place line when neither place nor address is set", () => {
    expect(buildPost(baseEvent).text).not.toContain("📍");
  });

  test("omits the date line when started_at is null", () => {
    const result = buildPost({ ...baseEvent, started_at: null });
    expect(result.text).not.toContain("📅");
  });

  test("emits a single link facet pointing to the URL", () => {
    const facets = buildPost(baseEvent).facets;
    expect(facets).toHaveLength(1);
    expect(facets[0]!.features).toEqual([
      {
        $type: "app.bsky.richtext.facet#link",
        uri: "https://connpass.com/event/12345/",
      },
    ]);
  });

  test("computes facet byteStart/byteEnd as UTF-8 byte offsets", () => {
    const result = buildPost({ ...baseEvent, place: "福岡市天神" });
    const facet = result.facets[0]!;
    const fullBytes = new TextEncoder().encode(result.text);
    const sliced = fullBytes.slice(facet.index.byteStart, facet.index.byteEnd);
    expect(new TextDecoder().decode(sliced)).toBe("https://connpass.com/event/12345/");
  });

  test("truncates long titles with ellipsis to stay within 300 graphemes", () => {
    const longTitle = "あ".repeat(500);
    const result = buildPost({ ...baseEvent, title: longTitle, place: "場所" });
    expect(new UnicodeString(result.text).graphemeLength).toBeLessThanOrEqual(300);
    expect(result.text).toContain(ELLIPSIS);
    expect(result.text.startsWith("あ")).toBe(true);
  });

  test("does not truncate titles that fit within the limit", () => {
    expect(buildPost(baseEvent).text).not.toContain(ELLIPSIS);
  });

  test("uses grapheme-aware slicing for multi-code-unit titles", () => {
    // Each 🎉 is 1 grapheme but 2 UTF-16 code units; UTF-16 slicing would keep only ~half.
    const result = buildPost({ ...baseEvent, title: "🎉".repeat(500), place: "場所" });
    const len = new UnicodeString(result.text).graphemeLength;
    expect(len).toBeLessThanOrEqual(300);
    expect(len).toBeGreaterThanOrEqual(270);
    expect(result.text.startsWith("🎉🎉🎉")).toBe(true);
  });

  test("does not split ZWJ grapheme clusters when truncating titles", () => {
    // At 25 UTF-8 bytes per family emoji the byte budget caps before the
    // grapheme budget, but the cluster must still survive intact.
    const family = "👨‍👩‍👧‍👦";
    const result = buildPost({ ...baseEvent, title: family.repeat(400), place: "場所" });
    const u = new UnicodeString(result.text);
    expect(u.graphemeLength).toBeLessThanOrEqual(300);
    expect(u.utf8.byteLength).toBeLessThanOrEqual(3000);
    expect(result.text.startsWith(family + family)).toBe(true);
  });

  test("truncates titles that fit 300 graphemes but exceed 3000 UTF-8 bytes", () => {
    // Without a byte cap this input (200 graphemes, ~5000 bytes) would slip
    // past the grapheme limit and fail at AtProto's lexicon validation.
    const family = "👨‍👩‍👧‍👦";
    const result = buildPost({ ...baseEvent, title: family.repeat(200), place: "場所" });
    const u = new UnicodeString(result.text);
    expect(u.graphemeLength).toBeLessThanOrEqual(300);
    expect(u.utf8.byteLength).toBeLessThanOrEqual(3000);
    expect(result.text).toContain(ELLIPSIS);
    expect(result.text.startsWith(family)).toBe(true);
  });

  test("drops the title when overhead alone exceeds budget and place is unavailable", () => {
    // A pathologically long URL pushes overhead past MAX_BYTES on its own.
    // Without a place line to shrink, the original title used to slip
    // through unchanged; now it must be dropped.
    const longUrl = `https://example.com/${"a".repeat(2900)}`;
    const result = buildPost({
      ...baseEvent,
      title: "Original title",
      url: longUrl,
      place: null,
      address: null,
    });
    expect(result.text).not.toContain("Original title");
    expect(result.text).toContain(longUrl);
  });

  test("truncates long place to stay within 300 graphemes", () => {
    const result = buildPost({ ...baseEvent, place: "あ".repeat(500) });
    const len = new UnicodeString(result.text).graphemeLength;
    expect(len).toBeLessThanOrEqual(300);
    expect(result.text).toContain(`📍 あ`);
    expect(result.text).toContain(ELLIPSIS);
  });

  test("recomputes facet offsets after truncation", () => {
    const result = buildPost({
      ...baseEvent,
      title: "x".repeat(500),
    });
    const facet = result.facets[0]!;
    const fullBytes = new TextEncoder().encode(result.text);
    const sliced = fullBytes.slice(facet.index.byteStart, facet.index.byteEnd);
    expect(new TextDecoder().decode(sliced)).toBe("https://connpass.com/event/12345/");
  });
});
