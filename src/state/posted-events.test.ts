import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAndPrune, isFirstRun, loadPosted, pickNew, savePosted } from "./posted-events.ts";
import type { ConnpassEvent } from "../connpass/types.ts";

const event = (id: number): ConnpassEvent => ({
  id,
  title: `event ${id}`,
  catch: null,
  description: null,
  url: `https://connpass.com/event/${id}/`,
  image_url: null,
  started_at: null,
  ended_at: null,
  address: null,
  place: null,
  group: null,
  event_type: "participation",
  open_status: "open",
});

describe("posted-events file I/O", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "posted-events-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("loadPosted returns empty state when file does not exist", async () => {
    expect(await loadPosted(join(dir, "missing.json"))).toEqual({ ids: [] });
  });

  test("loadPosted reads ids from existing file", async () => {
    const path = join(dir, "p.json");
    await writeFile(path, JSON.stringify({ ids: [1, 2, 3] }));
    expect(await loadPosted(path)).toEqual({ ids: [1, 2, 3] });
  });

  test("savePosted writes pretty-printed JSON with trailing newline", async () => {
    const path = join(dir, "p.json");
    await savePosted(path, { ids: [1, 2] });
    const raw = await readFile(path, "utf-8");
    expect(raw).toBe('{\n  "ids": [\n    1,\n    2\n  ]\n}\n');
  });

  test("savePosted + loadPosted round-trip", async () => {
    const path = join(dir, "p.json");
    await savePosted(path, { ids: [10, 20, 30] });
    expect(await loadPosted(path)).toEqual({ ids: [10, 20, 30] });
  });

  test("savePosted cleans up its temp file", async () => {
    const path = join(dir, "p.json");
    await savePosted(path, { ids: [1] });
    expect(await readdir(dir)).toEqual(["p.json"]);
  });

  test.for([
    ["top-level array", "[1, 2, 3]"],
    ["top-level null", "null"],
    ["missing ids", '{"foo": 1}'],
    ["ids not array", '{"ids": 1}'],
    ["ids contains float", '{"ids": [1, 1.5]}'],
  ] as const)("loadPosted throws on invalid shape: %s", async ([, payload]) => {
    const path = join(dir, "p.json");
    await writeFile(path, payload);
    await expect(loadPosted(path)).rejects.toThrow(/Invalid posted-events state/);
  });
});

describe("isFirstRun", () => {
  test("true when ids is empty", () => {
    expect(isFirstRun({ ids: [] })).toBe(true);
  });

  test("false when ids has any entry", () => {
    expect(isFirstRun({ ids: [1] })).toBe(false);
  });
});

describe("pickNew", () => {
  test("filters out events whose ids are already known", () => {
    const events = [event(1), event(2), event(3)];
    expect(pickNew({ ids: [2] }, events)).toEqual([event(1), event(3)]);
  });

  test("returns all events on empty state", () => {
    const events = [event(1), event(2)];
    expect(pickNew({ ids: [] }, events)).toEqual(events);
  });

  test("returns empty when all events are known", () => {
    expect(pickNew({ ids: [1, 2] }, [event(1), event(2)])).toEqual([]);
  });

  test("preserves input ordering", () => {
    const events = [event(3), event(1), event(2)];
    expect(pickNew({ ids: [1] }, events)).toEqual([event(3), event(2)]);
  });
});

describe("appendAndPrune", () => {
  test("appends new ids in order", () => {
    expect(appendAndPrune({ ids: [1, 2] }, [3, 4])).toEqual({ ids: [1, 2, 3, 4] });
  });

  test("returns ids unchanged when under cap", () => {
    expect(appendAndPrune({ ids: [1] }, [2], 100)).toEqual({ ids: [1, 2] });
  });

  test("prunes oldest entries when exceeding cap", () => {
    const state = { ids: Array.from({ length: 100 }, (_, i) => i) };
    const result = appendAndPrune(state, [100, 101], 100);
    expect(result.ids).toHaveLength(100);
    expect(result.ids[0]).toBe(2);
    expect(result.ids[99]).toBe(101);
  });

  test("uses default cap of 100", () => {
    const state = { ids: Array.from({ length: 100 }, (_, i) => i) };
    const result = appendAndPrune(state, [100]);
    expect(result.ids).toHaveLength(100);
    expect(result.ids[0]).toBe(1);
    expect(result.ids[99]).toBe(100);
  });

  test("does not mutate input state", () => {
    const state = { ids: [1, 2] };
    appendAndPrune(state, [3]);
    expect(state.ids).toEqual([1, 2]);
  });
});
