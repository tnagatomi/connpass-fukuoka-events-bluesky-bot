import type { ConnpassEvent } from "./types.js";

export function isPostable(event: ConnpassEvent): boolean {
  return event.open_status !== "cancelled";
}
