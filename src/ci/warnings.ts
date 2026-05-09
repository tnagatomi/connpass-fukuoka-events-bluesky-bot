import { appendFile } from "node:fs/promises";

export type PartialFailureInfo = {
  attempted: number;
  successCount: number;
};

export async function emitPartialFailureWarning({
  attempted,
  successCount,
}: PartialFailureInfo): Promise<void> {
  const failed = attempted - successCount;
  const message = `Some events failed to post: ${failed}/${attempted}`;
  // Workflow command surfaces as a job-level warning annotation in the Actions UI.
  console.log(`::warning::${message}`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    await appendFile(summaryPath, `### Partial failure\n\n${message}\n\n`);
  }
}
