import { Agent, CredentialSession } from "@atproto/api";
import { findExistingEventPost, type PostSearcher } from "./lookup.ts";
import { type BlobUploader, buildExternalCard } from "./ogp.ts";
import { buildPost } from "./post-builder.ts";
import type { ConnpassEvent } from "../connpass/types.ts";

const SERVICE_URL = new URL("https://bsky.social");

export type Poster = BlobUploader & Pick<Agent, "post"> & { app: { bsky: { feed: PostSearcher } } };

// "failed" means we have no evidence the event was posted, so the caller
// must NOT record state and let the next cron retry; the other two outcomes
// are both safe to record.
export type PostResult = "posted" | "already_present" | "failed";

export type BlueskyClient = {
  postEvent(event: ConnpassEvent): Promise<PostResult>;
};

export function createBlueskyClient(agent: Poster, author: string): BlueskyClient {
  return {
    async postEvent(event) {
      const lookup = () => findExistingEventPost(agent.app.bsky.feed, author, event.url);

      if ((await lookup()) === "found") {
        console.log(`Skipping event ${event.id}: already posted to Bluesky`);
        return "already_present";
      }

      try {
        const post = buildPost(event);
        const external = await buildExternalCard(agent, event);
        await agent.post({
          text: post.text,
          facets: post.facets,
          embed: { $type: "app.bsky.embed.external", external },
          createdAt: new Date().toISOString(),
        });
        return "posted";
      } catch (err) {
        // The post may still have been accepted (timeout, network blip after
        // the server processed it). Search before declaring failure so we
        // don't repost on the next cron tick.
        if ((await lookup()) === "found") {
          console.log(`Event ${event.id} accepted by Bluesky despite client error:`, err);
          return "already_present";
        }
        console.error(`Failed to post event ${event.id}:`, err);
        return "failed";
      }
    },
  };
}

export function createDryRunClient(): BlueskyClient {
  return {
    async postEvent(event) {
      console.log(`[dry-run] would post: ${event.title} <${event.url}>`);
      return "posted";
    },
  };
}

export async function login(handle: string, appPassword: string): Promise<Agent> {
  const session = new CredentialSession(SERVICE_URL);
  await session.login({ identifier: handle, password: appPassword });
  return new Agent(session);
}
