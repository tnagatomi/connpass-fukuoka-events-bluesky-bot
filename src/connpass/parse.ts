import type { ConnpassEvent, OpenStatus } from "./types.ts";

const OPEN_STATUSES: readonly OpenStatus[] = ["preopen", "open", "close", "cancelled"];

function isOpenStatus(value: unknown): value is OpenStatus {
  return (OPEN_STATUSES as readonly string[]).includes(value as string);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// YYYY-MM-DDTHH:mm[:ss[.fff]] with a required Z/±HH:MM offset. Calendar
// fields are checked below because Date.parse silently rolls over invalid
// days (e.g. Feb 31 → Mar 3). The offset is required because formatting an
// offset-less string would interpret the time in the host's local timezone,
// which on a UTC CI runner shifts the displayed date by hours.
const ISO_DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function asIsoDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATETIME_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > lastDay) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function parseEvent(raw: unknown): ConnpassEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== "number" || !Number.isInteger(r.id)) return null;
  if (typeof r.title !== "string") return null;
  if (!isWebUrl(r.url)) return null;
  if (!isOpenStatus(r.open_status)) return null;

  return {
    id: r.id,
    title: r.title,
    url: r.url,
    open_status: r.open_status,
    started_at: asIsoDateTime(r.started_at),
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
