import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { emitPartialFailureWarning } from "./warnings.ts";

describe("emitPartialFailureWarning", () => {
  let dir: string;
  let originalSummary: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warnings-test-"));
    originalSummary = process.env.GITHUB_STEP_SUMMARY;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    if (originalSummary === undefined) {
      delete process.env.GITHUB_STEP_SUMMARY;
    } else {
      process.env.GITHUB_STEP_SUMMARY = originalSummary;
    }
    vi.restoreAllMocks();
  });

  test("emits ::warning:: workflow command on stdout", async () => {
    delete process.env.GITHUB_STEP_SUMMARY;

    await emitPartialFailureWarning({ attempted: 3, successCount: 2 });

    expect(console.log).toHaveBeenCalledWith("::warning::Some events failed to post: 1/3");
  });

  test("appends a Partial failure section to GITHUB_STEP_SUMMARY when set", async () => {
    const summaryPath = join(dir, "summary.md");
    process.env.GITHUB_STEP_SUMMARY = summaryPath;

    await emitPartialFailureWarning({ attempted: 5, successCount: 3 });

    const content = await readFile(summaryPath, "utf-8");
    expect(content).toContain("### Partial failure");
    expect(content).toContain("Some events failed to post: 2/5");
  });

  test("skips summary append when GITHUB_STEP_SUMMARY is unset", async () => {
    delete process.env.GITHUB_STEP_SUMMARY;

    await expect(
      emitPartialFailureWarning({ attempted: 2, successCount: 1 }),
    ).resolves.toBeUndefined();
  });
});
