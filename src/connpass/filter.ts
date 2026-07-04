import type { ConnpassEvent } from "./types.ts";

// Events that already started are excluded, not just cancelled ones: the bot
// announces upcoming events, and the id-diff in pickNew treats every unknown
// id as "new". When connpass suddenly widened the prefecture query's result
// window (2026-05-27), months-old events flooded in as unknown ids and got
// mass-posted. A date guard makes that class of anomaly harmless. Events
// without a start time cannot be "past", so they stay postable.
export function isPostable(event: ConnpassEvent, now: Date): boolean {
  if (event.open_status === "cancelled") return false;
  if (event.started_at !== null && new Date(event.started_at) <= now) return false;
  return true;
}
