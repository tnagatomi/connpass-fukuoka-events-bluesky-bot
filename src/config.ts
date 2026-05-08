export type Config = {
  blueskyHandle: string;
  blueskyAppPassword: string;
  connpassApiKey: string;
  postedEventsPath: string;
  dryRun: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    blueskyHandle: required(env, "BSKY_HANDLE"),
    blueskyAppPassword: required(env, "BSKY_APP_PASSWORD"),
    connpassApiKey: required(env, "CONNPASS_API_KEY"),
    postedEventsPath: env.POSTED_EVENTS_PATH ?? "./posted-events.json",
    dryRun: env.DRY_RUN === "1",
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
