import { fileURLToPath } from "node:url";
import {
  type BlueskyClient,
  createBlueskyClient,
  createDryRunClient,
  login,
} from "./bluesky/client.ts";
import { emitPartialFailureWarning, type PartialFailureInfo } from "./ci/warnings.ts";
import { type Config, loadConfig } from "./config.ts";
import { fetchFukuokaLatestEvents } from "./connpass/client.ts";
import { isPostable } from "./connpass/filter.ts";
import type { ConnpassEvent } from "./connpass/types.ts";
import {
  appendAndPrune,
  isFirstRun,
  loadPosted,
  pickNew,
  savePosted,
} from "./state/posted-events.ts";

// Stop *starting* new posts after this many ms so the job can finish its
// state-persisting steps within the 10-minute backstop in post.yml. The
// deadline only gates new iterations; a post that has already started can
// still run ~25s on top (cardyb 10s + image fetch 10s + atproto). 4 minutes
// leaves ~6 minutes of headroom for that tail plus commit/push.
const BATCH_DEADLINE_MS = 4 * 60 * 1000;

export type RunDeps = {
  fetchEvents: () => Promise<ConnpassEvent[]>;
  client: BlueskyClient;
  now?: () => number;
  warn?: (info: PartialFailureInfo) => Promise<void>;
};

export async function runOnce(config: Config, deps: RunDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const [state, fetched] = await Promise.all([
    loadPosted(config.postedEventsPath),
    deps.fetchEvents(),
  ]);
  const events = fetched.filter(isPostable);

  if (isFirstRun(state)) {
    // connpass returns events newest-first; appendAndPrune retains its tail,
    // so store oldest-first to preserve the most recent ids across later prunes.
    const ids = events.map((e) => e.id).toReversed();
    if (!config.dryRun) {
      await savePosted(config.postedEventsPath, { ids });
    }
    console.log(`First run: recorded ${ids.length} ids without posting`);
    return;
  }

  const toPost = pickNew(state, events).toReversed();
  if (toPost.length === 0) {
    console.log("No new events");
    return;
  }

  let currentState = state;
  let successCount = 0;
  let deferred = 0;
  const startedAt = now();
  // Post sequentially so the timeline keeps oldest-first ordering even when
  // an individual post fails and the loop moves on. Persist after each
  // success so a mid-loop crash cannot silently re-post already-delivered
  // events on the next run.
  for (const [i, event] of toPost.entries()) {
    if (now() - startedAt > BATCH_DEADLINE_MS) {
      deferred = toPost.length - i;
      console.log(`Hit batch deadline; deferring ${deferred} events to next run`);
      break;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop
      await deps.client.postEvent(event);
    } catch (err) {
      console.error(`Failed to post event ${event.id}:`, err);
      continue;
    }
    successCount++;
    if (!config.dryRun) {
      currentState = appendAndPrune(currentState, [event.id]);
      // oxlint-disable-next-line no-await-in-loop
      await savePosted(config.postedEventsPath, currentState);
    }
  }

  const attempted = toPost.length - deferred;
  console.log(`Posted ${successCount}/${attempted} events`);

  if (attempted > 0 && successCount === 0) {
    throw new Error(`All ${attempted} post attempts failed`);
  }
  if (successCount < attempted) {
    const warn = deps.warn ?? emitPartialFailureWarning;
    await warn({ attempted, successCount });
  }
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const client = config.dryRun
    ? createDryRunClient()
    : createBlueskyClient(await login(config.blueskyHandle, config.blueskyAppPassword));

  await runOnce(config, {
    fetchEvents: () => fetchFukuokaLatestEvents(config.connpassApiKey),
    client,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
