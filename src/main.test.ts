import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runOnce } from "./main.js";
import type { Config } from "./config.js";
import type { ConnpassEvent } from "./connpass/types.js";

const event = (id: number, overrides: Partial<ConnpassEvent> = {}): ConnpassEvent => ({
  id,
  title: `event ${id}`,
  catch: null,
  description: null,
  url: `https://connpass.com/event/${id}/`,
  image_url: null,
  started_at: "2026-05-15T19:00:00+09:00",
  ended_at: null,
  address: null,
  place: null,
  group: null,
  event_type: "participation",
  open_status: "open",
  ...overrides,
});

describe("runOnce", () => {
  let dir: string;
  let statePath: string;
  let config: Config;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "main-test-"));
    statePath = join(dir, "posted.json");
    config = {
      blueskyHandle: "bot.bsky.social",
      blueskyAppPassword: "x",
      connpassApiKey: "k",
      postedEventsPath: statePath,
      dryRun: false,
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("first run records all ids without posting", async () => {
    const fetchEvents = vi.fn().mockResolvedValue([event(3), event(2), event(1)]);
    const postEvent = vi.fn();

    await runOnce(config, { fetchEvents, client: { postEvent } });

    expect(postEvent).not.toHaveBeenCalled();
    const saved = JSON.parse(await readFile(statePath, "utf-8"));
    expect(saved).toEqual({ ids: [3, 2, 1] });
  });

  test("posts new events oldest-first and saves their ids", async () => {
    await writeFile(statePath, JSON.stringify({ ids: [99] }));
    const fetched = [event(3), event(2), event(1)];
    const postEvent = vi.fn().mockResolvedValue(undefined);

    await runOnce(config, { fetchEvents: () => Promise.resolve(fetched), client: { postEvent } });

    expect(postEvent.mock.calls.map((c) => (c[0] as ConnpassEvent).id)).toEqual([1, 2, 3]);
    const saved = JSON.parse(await readFile(statePath, "utf-8"));
    expect(saved.ids).toEqual([99, 1, 2, 3]);
  });

  test("filters out cancelled events before posting", async () => {
    await writeFile(statePath, JSON.stringify({ ids: [99] }));
    const fetched = [event(2, { open_status: "cancelled" }), event(1, { open_status: "open" })];
    const postEvent = vi.fn().mockResolvedValue(undefined);

    await runOnce(config, { fetchEvents: () => Promise.resolve(fetched), client: { postEvent } });

    expect(postEvent.mock.calls.map((c) => (c[0] as ConnpassEvent).id)).toEqual([1]);
  });

  test("does not save failed event ids; succeeds for others", async () => {
    await writeFile(statePath, JSON.stringify({ ids: [99] }));
    const postEvent = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const fetched = [event(3), event(2), event(1)];

    await runOnce(config, { fetchEvents: () => Promise.resolve(fetched), client: { postEvent } });

    expect(postEvent).toHaveBeenCalledTimes(3);
    const saved = JSON.parse(await readFile(statePath, "utf-8"));
    expect(saved.ids).toEqual([99, 1, 3]);
  });

  test("leaves state untouched when there are no new events", async () => {
    await writeFile(statePath, JSON.stringify({ ids: [1, 2, 3] }));
    const postEvent = vi.fn();

    await runOnce(config, {
      fetchEvents: () => Promise.resolve([event(1), event(2)]),
      client: { postEvent },
    });

    expect(postEvent).not.toHaveBeenCalled();
    const saved = JSON.parse(await readFile(statePath, "utf-8"));
    expect(saved).toEqual({ ids: [1, 2, 3] });
  });

  test("dry-run on first run skips saving state", async () => {
    const dryConfig: Config = { ...config, dryRun: true };
    const postEvent = vi.fn();

    await runOnce(dryConfig, {
      fetchEvents: () => Promise.resolve([event(1)]),
      client: { postEvent },
    });

    await expect(readFile(statePath, "utf-8")).rejects.toThrow();
    expect(postEvent).not.toHaveBeenCalled();
  });

  test("dry-run skips state save even after successful posts", async () => {
    const dryConfig: Config = { ...config, dryRun: true };
    await writeFile(statePath, JSON.stringify({ ids: [99] }));
    const postEvent = vi.fn().mockResolvedValue(undefined);

    await runOnce(dryConfig, {
      fetchEvents: () => Promise.resolve([event(1)]),
      client: { postEvent },
    });

    expect(postEvent).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(await readFile(statePath, "utf-8"));
    expect(saved).toEqual({ ids: [99] });
  });
});
