import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCloudTaskStore } from "@/lib/cloudTaskStore";
import type { CloudTask } from "@/types/task";

const useOwnerAuthMock = vi.fn();
const fetchCloudTasksMock = vi.fn();
const setCloudTaskStatusMock = vi.fn();
const getFirebaseFirestoreMock = vi.fn();

vi.mock("@/components/auth/OwnerGate", () => ({
  useOwnerAuth: () => useOwnerAuthMock(),
}));

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseFirestore: () => getFirebaseFirestoreMock(),
}));

vi.mock("@/lib/firebase/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/tasks")>("@/lib/firebase/tasks");
  return {
    ...actual,
    fetchCloudTasks: (...args: unknown[]) => fetchCloudTasksMock(...args),
    setCloudTaskStatus: (...args: unknown[]) => setCloudTaskStatusMock(...args),
  };
});

// Imported after the mocks so the hook picks up the mocked modules.
const { useCloudTasks } = await import("@/hooks/useCloudTasks");

const FAKE_DB = { __fakeFirestore: true };

const todoTask: CloudTask = {
  id: "t1",
  title: "Present perfect tekrar et",
  subject: "English",
  source_skill: "english-teacher",
  description: "",
  due_date: "2026-08-24",
  status: "todo",
  idempotency_key: "auto:x",
  created_at: "2026-08-23T09:00:00.000Z",
  updated_at: null,
  completed_at: null,
};

beforeEach(() => {
  resetCloudTaskStore();
  fetchCloudTasksMock.mockReset();
  setCloudTaskStatusMock.mockReset();
  getFirebaseFirestoreMock.mockReset();
  getFirebaseFirestoreMock.mockReturnValue(FAKE_DB);
  useOwnerAuthMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCloudTasks — no verified owner", () => {
  it("never calls fetchCloudTasks when there is no owner uid", async () => {
    useOwnerAuthMock.mockReturnValue({ ownerUid: null });
    renderHook(() => useCloudTasks());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchCloudTasksMock).not.toHaveBeenCalled();
  });

  it("reports disabled: true and an empty task list", () => {
    useOwnerAuthMock.mockReturnValue({ ownerUid: null });
    const { result } = renderHook(() => useCloudTasks());

    expect(result.current.disabled).toBe(true);
    expect(result.current.tasks).toEqual([]);
  });

  it("toggleStatus is a no-op without a verified owner", async () => {
    useOwnerAuthMock.mockReturnValue({ ownerUid: null });
    const { result } = renderHook(() => useCloudTasks());

    await act(async () => {
      await result.current.toggleStatus(todoTask);
    });

    expect(setCloudTaskStatusMock).not.toHaveBeenCalled();
  });
});

describe("useCloudTasks — verified owner", () => {
  it("fetches tasks scoped to the owner uid once verified", async () => {
    useOwnerAuthMock.mockReturnValue({ ownerUid: "owner-123" });
    fetchCloudTasksMock.mockResolvedValue([todoTask]);

    const { result } = renderHook(() => useCloudTasks());

    await waitFor(() => expect(result.current.tasks).toEqual([todoTask]));
    expect(fetchCloudTasksMock).toHaveBeenCalledWith(FAKE_DB, "owner-123", expect.any(String), expect.any(String));
  });

  it("surfaces a fetch failure through describeCloudTaskError", async () => {
    useOwnerAuthMock.mockReturnValue({ ownerUid: "owner-123" });
    fetchCloudTasksMock.mockRejectedValue({ code: "permission-denied" });

    const { result } = renderHook(() => useCloudTasks());

    await waitFor(() => expect(result.current.error?.kind).toBe("permission"));
    expect(result.current.tasks).toEqual([]);
  });
});

describe("useCloudTasks — toggleStatus", () => {
  beforeEach(() => {
    useOwnerAuthMock.mockReturnValue({ ownerUid: "owner-123" });
    fetchCloudTasksMock.mockResolvedValue([todoTask]);
  });

  it("optimistically flips todo -> done with a completed_at timestamp", async () => {
    setCloudTaskStatusMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCloudTasks());
    await waitFor(() => expect(result.current.tasks).toEqual([todoTask]));

    await act(async () => {
      await result.current.toggleStatus(todoTask);
    });

    expect(result.current.tasks[0]!.status).toBe("done");
    expect(result.current.tasks[0]!.completed_at).not.toBeNull();
    expect(setCloudTaskStatusMock).toHaveBeenCalledWith(FAKE_DB, "owner-123", "t1", "done");
  });

  it("optimistically flips done -> todo with completed_at set to null", async () => {
    const doneTask: CloudTask = { ...todoTask, status: "done", completed_at: "2026-08-23T10:00:00.000Z" };
    fetchCloudTasksMock.mockResolvedValue([doneTask]);
    setCloudTaskStatusMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCloudTasks());
    await waitFor(() => expect(result.current.tasks).toEqual([doneTask]));

    await act(async () => {
      await result.current.toggleStatus(doneTask);
    });

    expect(result.current.tasks[0]!.status).toBe("todo");
    expect(result.current.tasks[0]!.completed_at).toBeNull();
    expect(setCloudTaskStatusMock).toHaveBeenCalledWith(FAKE_DB, "owner-123", "t1", "todo");
  });

  it("rolls back the optimistic update when the Firestore write fails", async () => {
    setCloudTaskStatusMock.mockRejectedValue({ code: "permission-denied" });
    const { result } = renderHook(() => useCloudTasks());
    await waitFor(() => expect(result.current.tasks).toEqual([todoTask]));

    await act(async () => {
      await result.current.toggleStatus(todoTask);
    });

    expect(result.current.tasks[0]!.status).toBe("todo");
    expect(result.current.tasks[0]!.completed_at).toBeNull();
    expect(result.current.error?.kind).toBe("permission");
  });
});
