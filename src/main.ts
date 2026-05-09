import { fileURLToPath } from "node:url";
import {
  type BlueskyClient,
  createBlueskyClient,
  createDryRunClient,
  login,
} from "./bluesky/client.ts";
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

export type RunDeps = {
  fetchEvents: () => Promise<ConnpassEvent[]>;
  client: BlueskyClient;
};

export async function runOnce(config: Config, deps: RunDeps): Promise<void> {
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

  const successIds: number[] = [];
  // Post sequentially to keep TL ordering and stay under the 1 req/sec limit.
  for (const event of toPost) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      await deps.client.postEvent(event);
      successIds.push(event.id);
    } catch (err) {
      console.error(`Failed to post event ${event.id}:`, err);
    }
  }

  if (!config.dryRun && successIds.length > 0) {
    await savePosted(config.postedEventsPath, appendAndPrune(state, successIds));
  }
  console.log(`Posted ${successIds.length}/${toPost.length} events`);

  if (successIds.length === 0) {
    throw new Error(`All ${toPost.length} post attempts failed`);
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
