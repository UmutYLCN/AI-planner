/**
 * A tiny module-scoped store for cloud tasks.
 *
 * Both the dashboard section and the /tasks page read the same window of tasks. Keeping
 * the result here — rather than in each component — means navigating between them reuses
 * the already-fetched data instead of spending another round of Firestore reads, without
 * pulling in a state-management library.
 */
import type { CloudTask, CloudTaskError } from "@/types/task";

/** How long a fetched window stays fresh before the next mount refetches it. */
export const CLOUD_TASK_CACHE_TTL_MS = 60_000;

export interface CloudTaskState {
  status: "idle" | "loading" | "ready" | "error";
  tasks: CloudTask[];
  error: CloudTaskError | null;
  /** Identifies which owner + date window `tasks` belongs to. */
  windowKey: string | null;
  fetchedAt: number;
}

const initialState: CloudTaskState = {
  status: "idle",
  tasks: [],
  error: null,
  windowKey: null,
  fetchedAt: 0,
};

let state: CloudTaskState = initialState;
const listeners = new Set<() => void>();

export function getCloudTaskState(): CloudTaskState {
  return state;
}

export function subscribeToCloudTasks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setCloudTaskState(next: Partial<CloudTaskState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/** Applies a local edit to the cached list, e.g. an optimistic status toggle. */
export function patchCloudTask(taskId: string, patch: Partial<CloudTask>): void {
  setCloudTaskState({
    tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
  });
}

export function isCloudTaskCacheFresh(windowKey: string, now: number = Date.now()): boolean {
  return (
    state.status === "ready" && state.windowKey === windowKey && now - state.fetchedAt < CLOUD_TASK_CACHE_TTL_MS
  );
}

/** Clears everything — used on sign-out and by tests. */
export function resetCloudTaskStore(): void {
  state = initialState;
  for (const listener of listeners) listener();
}
