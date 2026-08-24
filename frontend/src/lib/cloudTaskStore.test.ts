import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCloudTaskState,
  isCloudTaskCacheFresh,
  patchCloudTask,
  resetCloudTaskStore,
  setCloudTaskState,
  subscribeToCloudTasks,
} from "@/lib/cloudTaskStore";
import type { CloudTask } from "@/types/task";

const task: CloudTask = {
  id: "t1",
  title: "Present perfect tekrar et",
  subject: "English",
  source_skill: "english-teacher",
  description: "",
  due_date: "2026-08-24",
  status: "todo",
  idempotency_key: "auto:x",
  created_at: null,
  updated_at: null,
  completed_at: null,
};

beforeEach(() => {
  resetCloudTaskStore();
});

describe("cloud task store", () => {
  it("starts idle with an empty task list", () => {
    const state = getCloudTaskState();
    expect(state.status).toBe("idle");
    expect(state.tasks).toEqual([]);
    expect(state.error).toBeNull();
  });

  it("merges partial updates without dropping other fields", () => {
    setCloudTaskState({ status: "loading" });
    expect(getCloudTaskState().status).toBe("loading");
    expect(getCloudTaskState().tasks).toEqual([]);

    setCloudTaskState({ tasks: [task] });
    expect(getCloudTaskState().status).toBe("loading");
    expect(getCloudTaskState().tasks).toEqual([task]);
  });

  it("notifies subscribers on every state change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToCloudTasks(listener);

    setCloudTaskState({ status: "ready" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setCloudTaskState({ status: "error" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("patches a single task in place, leaving the rest untouched", () => {
    const other: CloudTask = { ...task, id: "t2", title: "Other task" };
    setCloudTaskState({ status: "ready", tasks: [task, other] });

    patchCloudTask("t1", { status: "done", completed_at: "2026-08-24T10:00:00.000Z" });

    const [first, second] = getCloudTaskState().tasks;
    expect(first).toMatchObject({ id: "t1", status: "done", completed_at: "2026-08-24T10:00:00.000Z" });
    expect(second).toEqual(other);
  });

  it("is a no-op when patching an id that is not present", () => {
    setCloudTaskState({ status: "ready", tasks: [task] });
    patchCloudTask("does-not-exist", { status: "done" });
    expect(getCloudTaskState().tasks).toEqual([task]);
  });

  describe("isCloudTaskCacheFresh", () => {
    it("is false before anything has been fetched", () => {
      expect(isCloudTaskCacheFresh("owner:2026-08-01:2026-09-01")).toBe(false);
    });

    it("is true for a matching window fetched moments ago", () => {
      const now = Date.now();
      setCloudTaskState({ status: "ready", windowKey: "owner:2026-08-01:2026-09-01", fetchedAt: now });
      expect(isCloudTaskCacheFresh("owner:2026-08-01:2026-09-01", now + 1000)).toBe(true);
    });

    it("is false once the TTL has elapsed", () => {
      const now = Date.now();
      setCloudTaskState({ status: "ready", windowKey: "owner:2026-08-01:2026-09-01", fetchedAt: now });
      expect(isCloudTaskCacheFresh("owner:2026-08-01:2026-09-01", now + 61_000)).toBe(false);
    });

    it("is false when the window key does not match (different owner or date range)", () => {
      const now = Date.now();
      setCloudTaskState({ status: "ready", windowKey: "owner:2026-08-01:2026-09-01", fetchedAt: now });
      expect(isCloudTaskCacheFresh("other-owner:2026-08-01:2026-09-01", now)).toBe(false);
    });

    it("is false while a fetch is in flight, even for a matching window", () => {
      const now = Date.now();
      setCloudTaskState({ status: "loading", windowKey: "owner:2026-08-01:2026-09-01", fetchedAt: now });
      expect(isCloudTaskCacheFresh("owner:2026-08-01:2026-09-01", now)).toBe(false);
    });
  });

  it("resetCloudTaskStore clears tasks, error and window and notifies subscribers", () => {
    setCloudTaskState({ status: "ready", tasks: [task], windowKey: "owner:x", fetchedAt: Date.now() });
    const listener = vi.fn();
    subscribeToCloudTasks(listener);

    resetCloudTaskStore();

    expect(getCloudTaskState()).toMatchObject({ status: "idle", tasks: [], error: null, windowKey: null });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
