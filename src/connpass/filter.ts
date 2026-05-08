import type { ConnpassEvent } from "./types.ts";

export function isPostable(event: ConnpassEvent): boolean {
  return event.open_status !== "cancelled";
}
