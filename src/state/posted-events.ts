import { readFile, rename, writeFile } from "node:fs/promises";
import { MAX_FETCH_EVENTS } from "../connpass/client.ts";
import type { ConnpassEvent } from "../connpass/types.ts";

export type PostedState = { ids: number[] };

export async function loadPosted(path: string): Promise<PostedState> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return { ids: [] };
    }
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isPostedState(parsed)) {
    throw new Error(`Invalid posted-events state at ${path}: expected { ids: number[] }`);
  }
  return parsed;
}

function isPostedState(value: unknown): value is PostedState {
  if (value === null || typeof value !== "object") return false;
  const ids = (value as { ids?: unknown }).ids;
  return Array.isArray(ids) && ids.every((id) => Number.isInteger(id));
}

export async function savePosted(path: string, state: PostedState): Promise<void> {
  // Write to a sibling tmp file then rename so an interrupted run cannot
  // leave a half-written posted-events.json that breaks the next load.
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tmp, path);
}

export function isFirstRun(state: PostedState): boolean {
  return state.ids.length === 0;
}

export function pickNew(state: PostedState, events: ConnpassEvent[]): ConnpassEvent[] {
  const known = new Set(state.ids);
  return events.filter((e) => !known.has(e.id));
}

export function appendAndPrune(
  state: PostedState,
  ids: number[],
  cap: number = MAX_FETCH_EVENTS,
): PostedState {
  return { ids: [...state.ids, ...ids].slice(-cap) };
}
