"use client";

/**
 * Reads Claude-created cloud tasks for the verified owner.
 *
 * Uses one-shot `getDocs` reads rather than a live listener: tasks only change when
 * Claude adds them or the user ticks a checkbox here, so a realtime subscription would
 * spend Spark-plan reads for nothing. The result is cached in a module-scoped store, so
 * moving between the dashboard and /tasks reuses it instead of refetching.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useOwnerAuth } from "@/components/auth/OwnerGate";
import {
  CLOUD_TASK_WINDOW_FUTURE_DAYS,
  CLOUD_TASK_WINDOW_PAST_DAYS,
  describeCloudTaskError,
  fetchCloudTasks,
  setCloudTaskStatus,
} from "@/lib/firebase/tasks";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import {
  type CloudTaskState,
  getCloudTaskState,
  isCloudTaskCacheFresh,
  patchCloudTask,
  setCloudTaskState,
  subscribeToCloudTasks,
} from "@/lib/cloudTaskStore";
import { shiftCalendarDay, todayInPlannerTimezone } from "@/lib/dates";
import type { CloudTask, CloudTaskError, CloudTaskStatus } from "@/types/task";

export interface UseCloudTasksResult {
  tasks: CloudTask[];
  loading: boolean;
  error: CloudTaskError | null;
  /** True when Firebase is not configured or the owner is not verified. */
  disabled: boolean;
  today: string;
  refresh: () => void;
  toggleStatus: (task: CloudTask) => Promise<void>;
}

const serverSnapshot: CloudTaskState = {
  status: "idle",
  tasks: [],
  error: null,
  windowKey: null,
  fetchedAt: 0,
};

export function useCloudTasks(): UseCloudTasksResult {
  const { ownerUid } = useOwnerAuth();
  const state = useSyncExternalStore(subscribeToCloudTasks, getCloudTaskState, () => serverSnapshot);

  const today = todayInPlannerTimezone();
  const from = shiftCalendarDay(today, -CLOUD_TASK_WINDOW_PAST_DAYS);
  const to = shiftCalendarDay(today, CLOUD_TASK_WINDOW_FUTURE_DAYS);
  const windowKey = ownerUid ? `${ownerUid}:${from}:${to}` : null;

  const load = useCallback(
    async (key: string, uid: string, signal: { cancelled: boolean }) => {
      const db = getFirebaseFirestore();
      if (!db) {
        setCloudTaskState({
          status: "error",
          error: { kind: "unconfigured", message: "Firebase yapılandırması eksik." },
        });
        return;
      }

      setCloudTaskState({ status: "loading", error: null });
      try {
        const tasks = await fetchCloudTasks(db, uid, from, to);
        if (signal.cancelled) return;
        setCloudTaskState({ status: "ready", tasks, error: null, windowKey: key, fetchedAt: Date.now() });
      } catch (error) {
        if (signal.cancelled) return;
        setCloudTaskState({ status: "error", error: describeCloudTaskError(error) });
      }
    },
    [from, to],
  );

  useEffect(() => {
    // No verified owner means no Firestore query, ever.
    if (!ownerUid || !windowKey) return;
    if (isCloudTaskCacheFresh(windowKey)) return;

    const signal = { cancelled: false };
    void load(windowKey, ownerUid, signal);
    return () => {
      // Stops a late response from overwriting state after unmount.
      signal.cancelled = true;
    };
  }, [ownerUid, windowKey, load]);

  const refresh = useCallback(() => {
    if (!ownerUid || !windowKey) return;
    void load(windowKey, ownerUid, { cancelled: false });
  }, [ownerUid, windowKey, load]);

  const toggleStatus = useCallback(
    async (task: CloudTask) => {
      const db = getFirebaseFirestore();
      if (!ownerUid || !db) return;

      const nextStatus: CloudTaskStatus = task.status === "done" ? "todo" : "done";
      const previous = { status: task.status, completed_at: task.completed_at };

      // Optimistic: the checkbox flips immediately and rolls back if the write fails.
      patchCloudTask(task.id, {
        status: nextStatus,
        completed_at: nextStatus === "done" ? new Date().toISOString() : null,
      });

      try {
        await setCloudTaskStatus(db, ownerUid, task.id, nextStatus);
        setCloudTaskState({ error: null });
      } catch (error) {
        patchCloudTask(task.id, previous);
        setCloudTaskState({ error: describeCloudTaskError(error) });
      }
    },
    [ownerUid],
  );

  return {
    tasks: state.tasks,
    loading: state.status === "loading" || (Boolean(ownerUid) && state.status === "idle"),
    error: state.error,
    disabled: !ownerUid,
    today,
    refresh,
    toggleStatus,
  };
}
