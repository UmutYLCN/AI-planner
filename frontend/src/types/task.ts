/**
 * Cloud tasks created by Claude skills through the remote MCP server.
 *
 * These live in Firestore at `users/{ownerUid}/tasks` and are completely separate from
 * the Dexie/IndexedDB roadmap store — roadmaps, PDFs and roadmap progress stay local.
 */

export type CloudTaskStatus = "todo" | "done";

export interface CloudTask {
  id: string;
  title: string;
  subject: string;
  source_skill: string;
  description: string;
  /** Local calendar day in `YYYY-MM-DD` (Europe/Istanbul). Never a timestamp. */
  due_date: string;
  status: CloudTaskStatus;
  idempotency_key: string;
  /** ISO strings converted from Firestore Timestamps, or null while pending on the server. */
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
}

/** Why a cloud-task read or write failed, in terms the UI can act on. */
export type CloudTaskErrorKind = "permission" | "unconfigured" | "network";

export interface CloudTaskError {
  kind: CloudTaskErrorKind;
  message: string;
}
