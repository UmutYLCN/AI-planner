/**
 * Minimal Firestore REST client for Cloudflare Workers.
 *
 * Uses a Firebase service account (JWT bearer -> Google OAuth access token -> Firestore
 * REST) instead of firebase-admin, which is far too heavy/Node-specific for a Worker.
 *
 * Security invariants (the service account bypasses Firestore Security Rules, so these
 * are the only thing standing between a tool call and the database):
 *   - the collection path is built here, from `FIREBASE_OWNER_UID` only;
 *   - no part of a Firestore path ever comes from MCP tool input;
 *   - only `users/{ownerUid}/tasks` is ever read or written;
 *   - access tokens are cached in memory and never logged, returned or thrown.
 */
import type { CloudTask } from './types.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_HOST = 'https://firestore.googleapis.com';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const REQUEST_TIMEOUT_MS = 10_000;
/** Refresh a little before real expiry so an in-flight request never uses a dead token. */
const TOKEN_EXPIRY_SKEW_SECONDS = 120;

/** Firestore document ids and Firebase UIDs are opaque ids — keep them strictly safe for a URL path. */
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_PROJECT_ID = /^[a-z0-9-]{4,64}$/;

export class FirestoreError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'FirestoreError';
    this.code = code;
    this.status = status;
  }
}

export interface FirestoreConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  ownerUid: string;
}

/** Reads and validates the Firestore configuration out of the Worker env. */
export function readFirestoreConfig(env: {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_OWNER_UID?: string;
}): FirestoreConfig {
  const projectId = (env.FIREBASE_PROJECT_ID ?? '').trim();
  const clientEmail = (env.FIREBASE_CLIENT_EMAIL ?? '').trim();
  const privateKey = env.FIREBASE_PRIVATE_KEY ?? '';
  const ownerUid = (env.FIREBASE_OWNER_UID ?? '').trim();

  const missing = [
    projectId ? null : 'FIREBASE_PROJECT_ID',
    clientEmail ? null : 'FIREBASE_CLIENT_EMAIL',
    privateKey ? null : 'FIREBASE_PRIVATE_KEY',
    ownerUid ? null : 'FIREBASE_OWNER_UID',
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    throw new FirestoreError('config_missing', `Worker is missing required secrets: ${missing.join(', ')}`);
  }
  if (!SAFE_PROJECT_ID.test(projectId)) {
    throw new FirestoreError('config_invalid', 'FIREBASE_PROJECT_ID is not a valid Firebase project id.');
  }
  if (!SAFE_PATH_SEGMENT.test(ownerUid)) {
    throw new FirestoreError('config_invalid', 'FIREBASE_OWNER_UID is not a valid Firebase UID.');
  }

  return { projectId, clientEmail, privateKey, ownerUid };
}

// ── Service-account access tokens ────────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

/**
 * Module-level cache. Worker isolates are per-colo and short-lived, so this is just an
 * optimisation; correctness never depends on it. Keyed by service account identity so a
 * rotated credential can never reuse a stale token.
 */
const tokenCache = new Map<string, CachedToken>();

/** Test seam — resets the in-memory token cache. */
export function clearAccessTokenCache(): void {
  tokenCache.clear();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

/**
 * Turns a `FIREBASE_PRIVATE_KEY` secret into raw PKCS#8 bytes.
 *
 * Handles the two shapes people actually paste: a real multi-line PEM, and a
 * single-line PEM whose newlines are escaped as literal `\n` (what you get when the
 * service-account JSON is copied field-by-field).
 */
export function decodePrivateKey(rawKey: string): ArrayBuffer {
  let pem = rawKey.trim();
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1);
  }
  pem = pem.replace(/\\r/g, '').replace(/\\n/g, '\n');

  const match = pem.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  if (!match || !match[1]) {
    throw new FirestoreError(
      'private_key_invalid',
      'FIREBASE_PRIVATE_KEY is not a PKCS#8 PEM block. Paste the whole "-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----" value.',
    );
  }

  const body = match[1].replace(/\s+/g, '');
  let binary: string;
  try {
    binary = atob(body);
  } catch {
    throw new FirestoreError('private_key_invalid', 'FIREBASE_PRIVATE_KEY body is not valid base64.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signServiceAccountAssertion(config: FirestoreConfig): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: config.clientEmail,
    scope: FIRESTORE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(claims)}`;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      decodePrivateKey(config.privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch (error) {
    if (error instanceof FirestoreError) throw error;
    // Deliberately does not include the underlying error — it can echo key material.
    throw new FirestoreError('private_key_invalid', 'FIREBASE_PRIVATE_KEY could not be imported as an RS256 signing key.');
  }

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'failed';
    throw new FirestoreError('network_error', `${what} request ${reason}.`);
  }
}

async function requestAccessToken(config: FirestoreConfig): Promise<CachedToken> {
  const assertion = await signServiceAccountAssertion(config);
  const response = await fetchWithTimeout(
    GOOGLE_TOKEN_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    },
    'Google OAuth token',
  );

  if (!response.ok) {
    // Google echoes nothing sensitive in `error`/`error_description`, but we still only
    // surface the coarse code so a misconfigured deployment cannot leak assertion details.
    let code = 'unknown_error';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string') code = body.error;
    } catch {
      /* non-JSON error body — keep the generic code */
    }
    throw new FirestoreError(
      'token_request_failed',
      `Google rejected the service-account credentials (${code}). Check FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.`,
      response.status,
    );
  }

  const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new FirestoreError('token_request_failed', 'Google returned a malformed token response.');
  }
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
  return {
    token: payload.access_token,
    expiresAtMs: Date.now() + Math.max(expiresIn - TOKEN_EXPIRY_SKEW_SECONDS, 30) * 1000,
  };
}

async function getAccessToken(config: FirestoreConfig): Promise<string> {
  const cacheKey = `${config.projectId}:${config.clientEmail}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now()) return cached.token;

  const fresh = await requestAccessToken(config);
  tokenCache.set(cacheKey, fresh);
  return fresh.token;
}

// ── Firestore value helpers ──────────────────────────────────────────────────

type FirestoreValue =
  | { stringValue: string }
  | { nullValue: null }
  | { integerValue: string }
  | { booleanValue: boolean }
  | { timestampValue: string };

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

function readString(fields: Record<string, FirestoreValue> | undefined, key: string): string {
  const value = fields?.[key];
  return value && 'stringValue' in value ? value.stringValue : '';
}

function readTimestamp(fields: Record<string, FirestoreValue> | undefined, key: string): string | null {
  const value = fields?.[key];
  return value && 'timestampValue' in value ? value.timestampValue : null;
}

function documentIdFromName(name: string | undefined): string {
  if (!name) return '';
  const parts = name.split('/');
  return parts[parts.length - 1] ?? '';
}

function toCloudTask(document: FirestoreDocument): CloudTask {
  const fields = document.fields;
  const status = readString(fields, 'status') === 'done' ? 'done' : 'todo';
  return {
    id: readString(fields, 'id') || documentIdFromName(document.name),
    title: readString(fields, 'title'),
    subject: readString(fields, 'subject'),
    source_skill: readString(fields, 'source_skill'),
    description: readString(fields, 'description'),
    due_date: readString(fields, 'due_date'),
    status,
    idempotency_key: readString(fields, 'idempotency_key'),
    created_at: readTimestamp(fields, 'created_at'),
    updated_at: readTimestamp(fields, 'updated_at'),
    completed_at: readTimestamp(fields, 'completed_at'),
  };
}

// ── Client ───────────────────────────────────────────────────────────────────

/** A task ready to be written: already validated, normalized and keyed. */
export interface TaskWrite {
  documentId: string;
  idempotencyKey: string;
  title: string;
  subject: string;
  source_skill: string;
  description: string;
  due_date: string;
}

export interface CreateTasksResult {
  inserted: TaskWrite[];
  skippedDuplicates: TaskWrite[];
}

export class FirestoreTaskStore {
  readonly #config: FirestoreConfig;
  readonly #databaseRoot: string;
  readonly #documentsRoot: string;
  readonly #ownerDocument: string;
  readonly #tasksCollection: string;

  constructor(config: FirestoreConfig) {
    this.#config = config;
    this.#databaseRoot = `projects/${config.projectId}/databases/(default)`;
    this.#documentsRoot = `${this.#databaseRoot}/documents`;
    // The one and only collection this Worker may touch.
    this.#ownerDocument = `${this.#documentsRoot}/users/${config.ownerUid}`;
    this.#tasksCollection = `${this.#ownerDocument}/tasks`;
  }

  /** Exposed for tests/diagnostics: the fixed, input-independent collection path. */
  get tasksCollectionPath(): string {
    return this.#tasksCollection;
  }

  #documentName(documentId: string): string {
    if (!SAFE_PATH_SEGMENT.test(documentId)) {
      throw new FirestoreError('invalid_document_id', 'Refusing to build a Firestore path from an unsafe document id.');
    }
    return `${this.#tasksCollection}/${documentId}`;
  }

  async #call<T>(path: string, body: unknown, what: string): Promise<T> {
    const token = await getAccessToken(this.#config);
    const response = await fetchWithTimeout(
      `${FIRESTORE_HOST}/v1/${path}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      what,
    );

    if (!response.ok) {
      let status = 'UNKNOWN';
      try {
        const errorBody = (await response.json()) as { error?: { status?: unknown } };
        if (typeof errorBody.error?.status === 'string') status = errorBody.error.status;
      } catch {
        /* non-JSON error body */
      }
      throw new FirestoreError(
        status === 'FAILED_PRECONDITION' ? 'failed_precondition' : 'firestore_error',
        `Firestore ${what} failed (${response.status} ${status}).`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  /** Returns the subset of the given document ids that already exist. */
  async #findExisting(documentIds: readonly string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    if (documentIds.length === 0) return existing;

    const results = await this.#call<Array<{ found?: FirestoreDocument; missing?: string }>>(
      `${this.#databaseRoot}/documents:batchGet`,
      { documents: documentIds.map((id) => this.#documentName(id)) },
      'batchGet',
    );

    for (const entry of results) {
      if (entry.found?.name) existing.add(documentIdFromName(entry.found.name));
    }
    return existing;
  }

  #buildCreateWrite(task: TaskWrite): unknown {
    return {
      update: {
        name: this.#documentName(task.documentId),
        fields: {
          id: { stringValue: task.documentId },
          title: { stringValue: task.title },
          subject: { stringValue: task.subject },
          source_skill: { stringValue: task.source_skill },
          description: { stringValue: task.description },
          due_date: { stringValue: task.due_date },
          // MCP input can never influence these three.
          status: { stringValue: 'todo' },
          idempotency_key: { stringValue: task.idempotencyKey },
          completed_at: { nullValue: null },
        },
      },
      // Atomic create-if-absent: a racing writer loses instead of overwriting.
      currentDocument: { exists: false },
      updateTransforms: [
        { fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' },
      ],
    };
  }

  /**
   * Creates the given tasks, skipping any whose document already exists.
   *
   * Duplicates are filtered out *before* the commit, so a re-sent batch never fails as a
   * whole. The `exists: false` precondition then only guards a genuine race; if that
   * fires we re-check and retry once with whatever is still missing.
   */
  async createTasks(tasks: readonly TaskWrite[]): Promise<CreateTasksResult> {
    if (tasks.length === 0) return { inserted: [], skippedDuplicates: [] };

    // Two tasks in the same call can normalize to the same document id.
    const unique: TaskWrite[] = [];
    const withinBatchDuplicates: TaskWrite[] = [];
    const seen = new Set<string>();
    for (const task of tasks) {
      if (seen.has(task.documentId)) withinBatchDuplicates.push(task);
      else {
        seen.add(task.documentId);
        unique.push(task);
      }
    }

    const skipped = [...withinBatchDuplicates];
    let pending = unique;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const existing = await this.#findExisting(pending.map((task) => task.documentId));
      const fresh = pending.filter((task) => !existing.has(task.documentId));
      for (const task of pending) {
        if (existing.has(task.documentId)) skipped.push(task);
      }

      if (fresh.length === 0) return { inserted: [], skippedDuplicates: skipped };

      try {
        await this.#call<unknown>(
          `${this.#databaseRoot}/documents:commit`,
          { writes: fresh.map((task) => this.#buildCreateWrite(task)) },
          'commit',
        );
        return { inserted: fresh, skippedDuplicates: skipped };
      } catch (error) {
        const isRace = error instanceof FirestoreError && error.code === 'failed_precondition';
        if (!isRace || attempt === 1) throw error;
        pending = fresh; // Someone won the race; recompute what is still missing.
      }
    }

    /* c8 ignore next */
    return { inserted: [], skippedDuplicates: skipped };
  }

  /**
   * Fetches tasks whose `due_date` falls in `[from, to]`, ordered by `due_date`.
   *
   * Only the date range is pushed down to Firestore, and only `due_date` is ordered on,
   * so this runs on the automatic single-field index — no composite index required.
   * Ties are broken by Firestore's implicit `__name__` ordering, making the scan stable.
   */
  async listTasksByDueDate(from: string, to: string, limit: number): Promise<CloudTask[]> {
    const results = await this.#call<Array<{ document?: FirestoreDocument }>>(
      `${this.#ownerDocument}:runQuery`,
      {
        structuredQuery: {
          from: [{ collectionId: 'tasks' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'due_date' },
                    op: 'GREATER_THAN_OR_EQUAL',
                    value: { stringValue: from },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'due_date' },
                    op: 'LESS_THAN_OR_EQUAL',
                    value: { stringValue: to },
                  },
                },
              ],
            },
          },
          orderBy: [{ field: { fieldPath: 'due_date' }, direction: 'ASCENDING' }],
          limit,
        },
      },
      'runQuery',
    );

    return results
      .filter((entry): entry is { document: FirestoreDocument } => entry.document !== undefined)
      .map((entry) => toCloudTask(entry.document));
  }
}
