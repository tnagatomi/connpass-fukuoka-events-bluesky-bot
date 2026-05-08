import { readFile, writeFile } from "node:fs/promises";
import { MAX_EVENTS_PER_PAGE } from "../connpass/client.js";
import type { ConnpassEvent } from "../connpass/types.js";

export type PostedState = { ids: number[] };

export async function loadPosted(path: string): Promise<PostedState> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as PostedState;
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return { ids: [] };
    }
    throw err;
  }
}

export async function savePosted(path: string, state: PostedState): Promise<void> {
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
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
  cap: number = MAX_EVENTS_PER_PAGE,
): PostedState {
  return { ids: [...state.ids, ...ids].slice(-cap) };
}
