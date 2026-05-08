import { describe, expect, test } from "vitest";
import { loadConfig } from "./config.js";

const fullEnv = {
  BSKY_HANDLE: "bot.bsky.social",
  BSKY_APP_PASSWORD: "abcd-efgh-ijkl-mnop",
  CONNPASS_API_KEY: "key",
} as NodeJS.ProcessEnv;

describe("loadConfig", () => {
  test("returns the parsed config when all required vars are set", () => {
    expect(loadConfig(fullEnv)).toEqual({
      blueskyHandle: "bot.bsky.social",
      blueskyAppPassword: "abcd-efgh-ijkl-mnop",
      connpassApiKey: "key",
      postedEventsPath: "./posted-events.json",
      dryRun: false,
    });
  });

  test("dryRun is true when DRY_RUN=1", () => {
    expect(loadConfig({ ...fullEnv, DRY_RUN: "1" }).dryRun).toBe(true);
  });

  test("dryRun is false for any other DRY_RUN value", () => {
    expect(loadConfig({ ...fullEnv, DRY_RUN: "true" }).dryRun).toBe(false);
    expect(loadConfig({ ...fullEnv, DRY_RUN: "0" }).dryRun).toBe(false);
  });

  test("postedEventsPath honours POSTED_EVENTS_PATH override", () => {
    expect(loadConfig({ ...fullEnv, POSTED_EVENTS_PATH: "/tmp/state.json" }).postedEventsPath).toBe(
      "/tmp/state.json",
    );
  });

  test.each(["BSKY_HANDLE", "BSKY_APP_PASSWORD", "CONNPASS_API_KEY"] as const)(
    "throws when %s is missing",
    (key) => {
      const env = { ...fullEnv, [key]: undefined };
      expect(() => loadConfig(env)).toThrow(key);
    },
  );
});
