import { Agent, CredentialSession } from "@atproto/api";
import { type BlobUploader, buildExternalCard } from "./ogp.js";
import { buildPost } from "./post-builder.js";
import type { ConnpassEvent } from "../connpass/types.js";

const SERVICE_URL = new URL("https://bsky.social");

export type Poster = BlobUploader & Pick<Agent, "post">;

export type BlueskyClient = {
  postEvent(event: ConnpassEvent): Promise<void>;
};

export function createBlueskyClient(agent: Poster): BlueskyClient {
  return {
    async postEvent(event) {
      const post = buildPost(event);
      const external = await buildExternalCard(agent, event);
      await agent.post({
        text: post.text,
        facets: post.facets,
        embed: { $type: "app.bsky.embed.external", external },
        createdAt: new Date().toISOString(),
      });
    },
  };
}

export function createDryRunClient(): BlueskyClient {
  return {
    async postEvent(event) {
      console.log(`[dry-run] would post: ${event.title} <${event.url}>`);
    },
  };
}

export async function login(handle: string, appPassword: string): Promise<Agent> {
  const session = new CredentialSession(SERVICE_URL);
  await session.login({ identifier: handle, password: appPassword });
  return new Agent(session);
}
