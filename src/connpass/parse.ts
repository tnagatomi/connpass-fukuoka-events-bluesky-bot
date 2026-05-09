import type { ConnpassEvent, OpenStatus } from "./types.ts";

const OPEN_STATUSES: readonly OpenStatus[] = ["preopen", "open", "close", "cancelled"];

function isOpenStatus(value: unknown): value is OpenStatus {
  return (OPEN_STATUSES as readonly string[]).includes(value as string);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseEvent(raw: unknown): ConnpassEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== "number" || !Number.isInteger(r.id)) return null;
  if (typeof r.title !== "string") return null;
  if (typeof r.url !== "string") return null;
  if (!isOpenStatus(r.open_status)) return null;

  return {
    id: r.id,
    title: r.title,
    url: r.url,
    open_status: r.open_status,
    started_at: asString(r.started_at),
    place: asString(r.place),
    address: asString(r.address),
    catch: asString(r.catch),
    description: asString(r.description),
    image_url: asString(r.image_url),
    ended_at: asString(r.ended_at),
    // Not consumed by current callers; preserve advertisement when present
    // and otherwise fall through to participation.
    event_type: r.event_type === "advertisement" ? "advertisement" : "participation",
    group: null,
  };
}

export function parseEvents(raw: unknown): ConnpassEvent[] {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("connpass response is not an object");
  }
  const events = (raw as Record<string, unknown>).events;
  if (!Array.isArray(events)) {
    throw new Error("connpass response.events is not an array");
  }

  const parsed: ConnpassEvent[] = [];
  for (const item of events) {
    const event = parseEvent(item);
    if (event === null) {
      console.warn("connpass event skipped: failed validation", item);
      continue;
    }
    parsed.push(event);
  }
  return parsed;
}
