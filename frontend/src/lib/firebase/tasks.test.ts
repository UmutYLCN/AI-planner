import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { compareCloudTasks, describeCloudTaskError, toCloudTask } from "@/lib/firebase/tasks";
import type { CloudTask } from "@/types/task";

describe("toCloudTask", () => {
  it("maps a fully populated document", () => {
    const created = Timestamp.fromDate(new Date("2026-08-23T09:00:00Z"));
    const completed = Timestamp.fromDate(new Date("2026-08-24T10:00:00Z"));

    const task = toCloudTask("doc1", {
      id: "doc1",
      title: "Present perfect tekrar et",
      subject: "English",
      source_skill: "english-teacher",
      description: "20 soru çöz",
      due_date: "2026-08-24",
      status: "done",
      idempotency_key: "auto:abc",
      created_at: created,
      updated_at: created,
      completed_at: completed,
    });

    expect(task).toEqual({
      id: "doc1",
      title: "Present perfect tekrar et",
      subject: "English",
      source_skill: "english-teacher",
      description: "20 soru çöz",
      due_date: "2026-08-24",
      status: "done",
      idempotency_key: "auto:abc",
      created_at: created.toDate().toISOString(),
      updated_at: created.toDate().toISOString(),
      completed_at: completed.toDate().toISOString(),
    });
  });

  it("falls back to the document id when the id field is missing", () => {
    const task = toCloudTask("fallback-id", { title: "x" });
    expect(task.id).toBe("fallback-id");
  });

  it("defaults an unknown or missing status to todo", () => {
    expect(toCloudTask("a", {}).status).toBe("todo");
    expect(toCloudTask("a", { status: "archived" }).status).toBe("todo");
    expect(toCloudTask("a", { status: "done" }).status).toBe("done");
  });

  it("defaults missing string fields to empty strings, not undefined", () => {
    const task = toCloudTask("a", {});
    expect(task.title).toBe("");
    expect(task.description).toBe("");
    expect(task.due_date).toBe("");
  });

  it("leaves timestamps null when the field is not a Firestore Timestamp", () => {
    const task = toCloudTask("a", { created_at: null, completed_at: "not-a-timestamp" });
    expect(task.created_at).toBeNull();
    expect(task.completed_at).toBeNull();
  });

  it("tolerates non-string values in string fields rather than throwing", () => {
    const task = toCloudTask("a", { title: 42, subject: null, source_skill: { nested: true } });
    expect(task.title).toBe("");
    expect(task.subject).toBe("");
    expect(task.source_skill).toBe("");
  });
});

describe("compareCloudTasks", () => {
  const base: CloudTask = {
    id: "a",
    title: "t",
    subject: "s",
    source_skill: "sk",
    description: "",
    due_date: "2026-08-24",
    status: "todo",
    idempotency_key: "k",
    created_at: "2026-08-23T09:00:00.000Z",
    updated_at: null,
    completed_at: null,
  };

  it("orders by due_date first", () => {
    const earlier = { ...base, id: "z", due_date: "2026-08-20" };
    const later = { ...base, id: "a", due_date: "2026-08-25" };
    expect([later, earlier].sort(compareCloudTasks)).toEqual([earlier, later]);
  });

  it("breaks a due_date tie by created_at", () => {
    const first = { ...base, id: "z", created_at: "2026-08-23T09:00:00.000Z" };
    const second = { ...base, id: "a", created_at: "2026-08-23T10:00:00.000Z" };
    expect([second, first].sort(compareCloudTasks)).toEqual([first, second]);
  });

  it("breaks a full tie by id for a stable order", () => {
    const first = { ...base, id: "a" };
    const second = { ...base, id: "b" };
    expect([second, first].sort(compareCloudTasks)).toEqual([first, second]);
  });
});

describe("describeCloudTaskError", () => {
  it("classifies permission-denied and unauthenticated as permission errors", () => {
    expect(describeCloudTaskError({ code: "permission-denied" }).kind).toBe("permission");
    expect(describeCloudTaskError({ code: "unauthenticated" }).kind).toBe("permission");
  });

  it("classifies failed-precondition as an unconfigured error", () => {
    expect(describeCloudTaskError({ code: "failed-precondition" }).kind).toBe("unconfigured");
  });

  it("falls back to a network error for anything else", () => {
    expect(describeCloudTaskError({ code: "unavailable" }).kind).toBe("network");
    expect(describeCloudTaskError(new Error("boom")).kind).toBe("network");
    expect(describeCloudTaskError("just a string").kind).toBe("network");
    expect(describeCloudTaskError(undefined).kind).toBe("network");
  });

  it("never echoes the raw error into the user-facing message", () => {
    const result = describeCloudTaskError({ code: "permission-denied", message: "SECRET_DETAIL_XYZ" });
    expect(result.message).not.toContain("SECRET_DETAIL_XYZ");
  });
});
