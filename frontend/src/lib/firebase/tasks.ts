/**
 * Firestore reads/writes for Claude-created cloud tasks.
 *
 * Every path is built from the verified owner UID that the caller passes in — it is
 * never taken from user input or from a document field.
 */
import {
  type Firestore,
  Timestamp,
  collection,
  doc,
  getDocs,
  limit as queryLimit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import type { CloudTask, CloudTaskError, CloudTaskStatus } from "@/types/task";

/** Upper bound on documents fetched in one window — keeps Spark-plan reads predictable. */
export const CLOUD_TASK_FETCH_LIMIT = 300;

/** How far back overdue tasks stay visible, and how far ahead upcoming ones are loaded. */
export const CLOUD_TASK_WINDOW_PAST_DAYS = 30;
export const CLOUD_TASK_WINDOW_FUTURE_DAYS = 120;

function tasksCollection(db: Firestore, ownerUid: string) {
  return collection(db, "users", ownerUid, "tasks");
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Converts a Firestore document into a CloudTask, tolerating partially written docs. */
export function toCloudTask(id: string, data: Record<string, unknown>): CloudTask {
  return {
    id: asString(data.id) || id,
    title: asString(data.title),
    subject: asString(data.subject),
    source_skill: asString(data.source_skill),
    description: asString(data.description),
    due_date: asString(data.due_date),
    status: data.status === "done" ? "done" : "todo",
    idempotency_key: asString(data.idempotency_key),
    created_at: timestampToIso(data.created_at),
    updated_at: timestampToIso(data.updated_at),
    completed_at: timestampToIso(data.completed_at),
  };
}

/** Stable ordering: due date, then creation time, then id. */
export function compareCloudTasks(a: CloudTask, b: CloudTask): number {
  if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  const createdA = a.created_at ?? "";
  const createdB = b.created_at ?? "";
  if (createdA !== createdB) return createdA < createdB ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Fetches tasks whose `due_date` falls inside `[from, to]`.
 *
 * Ordered by `due_date` alone so Firestore serves it from the automatic single-field
 * index — no composite index is ever needed.
 */
export async function fetchCloudTasks(
  db: Firestore,
  ownerUid: string,
  from: string,
  to: string,
): Promise<CloudTask[]> {
  const snapshot = await getDocs(
    query(
      tasksCollection(db, ownerUid),
      where("due_date", ">=", from),
      where("due_date", "<=", to),
      orderBy("due_date", "asc"),
      queryLimit(CLOUD_TASK_FETCH_LIMIT),
    ),
  );

  return snapshot.docs.map((document) => toCloudTask(document.id, document.data())).sort(compareCloudTasks);
}

/**
 * Flips a task between todo and done.
 *
 * `completed_at` is a server timestamp when done and null when reopened, and every write
 * re-stamps `updated_at` — matching what the Firestore rules enforce.
 */
export async function setCloudTaskStatus(
  db: Firestore,
  ownerUid: string,
  taskId: string,
  status: CloudTaskStatus,
): Promise<void> {
  await updateDoc(doc(db, "users", ownerUid, "tasks", taskId), {
    status,
    completed_at: status === "done" ? serverTimestamp() : null,
    updated_at: serverTimestamp(),
  });
}

/** Turns a thrown Firestore error into something the UI can distinguish and display. */
export function describeCloudTaskError(error: unknown): CloudTaskError {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";

  if (code === "permission-denied" || code === "unauthenticated") {
    return {
      kind: "permission",
      message:
        "Firestore bu hesaba izin vermedi. Güvenlik kurallarındaki owner UID'nin giriş yapan hesapla aynı olduğundan emin ol.",
    };
  }
  if (code === "failed-precondition") {
    return {
      kind: "unconfigured",
      message: "Firestore veritabanı bu sorgu için hazır değil. Kuralların ve indekslerin deploy edildiğini kontrol et.",
    };
  }
  return {
    kind: "network",
    message: "Görevler yüklenemedi. Bağlantını kontrol edip tekrar dene.",
  };
}
