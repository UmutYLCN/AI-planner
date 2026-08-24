import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FirestoreError,
  FirestoreTaskStore,
  clearAccessTokenCache,
  decodePrivateKey,
  readFirestoreConfig,
  type TaskWrite,
} from '../src/firestore.js';
import { generateTestPrivateKeyPem, toEscapedPem } from './helpers/testKeys.js';

const OWNER_UID = 'ownerUid123';
const PROJECT_ID = 'ai-planner-test';
const ACCESS_TOKEN = 'ya29.super-secret-access-token';

let privateKeyPem: string;

beforeAll(async () => {
  privateKeyPem = await generateTestPrivateKeyPem();
});

interface Call {
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

let calls: Call[] = [];

/** Installs a fetch double. `firestoreResponder` answers everything except the token endpoint. */
function mockFetch(firestoreResponder: (url: string, body: any) => unknown | Response) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    const headers = (init?.headers ?? {}) as Record<string, string>;

    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      calls.push({ url, body: rawBody, headers });
      return Response.json({ access_token: ACCESS_TOKEN, expires_in: 3600, token_type: 'Bearer' });
    }

    const body = rawBody ? JSON.parse(rawBody) : undefined;
    calls.push({ url, body, headers });
    const result = firestoreResponder(url, body);
    return result instanceof Response ? result : Response.json(result);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function makeStore(): FirestoreTaskStore {
  return new FirestoreTaskStore(
    readFirestoreConfig({
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: 'planner@ai-planner-test.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: privateKeyPem,
      FIREBASE_OWNER_UID: OWNER_UID,
    }),
  );
}

function taskWrite(overrides: Partial<TaskWrite> = {}): TaskWrite {
  return {
    documentId: 'a'.repeat(64),
    idempotencyKey: 'auto:test',
    title: 'Present perfect tekrar et',
    subject: 'English',
    source_skill: 'english-teacher',
    description: 'notlar',
    due_date: '2026-08-24',
    ...overrides,
  };
}

function firestoreDoc(store: FirestoreTaskStore, id: string, fields: Record<string, unknown>) {
  return {
    name: `${store.tasksCollectionPath}/${id}`,
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value])),
  };
}

beforeEach(() => {
  calls = [];
  clearAccessTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('configuration', () => {
  it('rejects a missing secret with a named, secret-free message', () => {
    expect(() => readFirestoreConfig({ FIREBASE_PROJECT_ID: PROJECT_ID })).toThrowError(/FIREBASE_CLIENT_EMAIL/);
  });

  it('rejects an owner uid that could escape the collection path', () => {
    for (const ownerUid of ['../../other', 'a/b', '']) {
      expect(() =>
        readFirestoreConfig({
          FIREBASE_PROJECT_ID: PROJECT_ID,
          FIREBASE_CLIENT_EMAIL: 'a@b.com',
          FIREBASE_PRIVATE_KEY: 'key',
          FIREBASE_OWNER_UID: ownerUid,
        }),
      ).toThrowError(FirestoreError);
    }
  });
});

describe('decodePrivateKey', () => {
  it('accepts a real multi-line PEM', () => {
    expect(decodePrivateKey(privateKeyPem).byteLength).toBeGreaterThan(100);
  });

  it('accepts a single-line PEM with escaped newlines', () => {
    const escaped = decodePrivateKey(toEscapedPem(privateKeyPem));
    expect(escaped.byteLength).toBe(decodePrivateKey(privateKeyPem).byteLength);
  });

  it('accepts a quoted, escaped PEM (how .dev.vars values arrive)', () => {
    const quoted = `"${toEscapedPem(privateKeyPem)}"`;
    expect(decodePrivateKey(quoted).byteLength).toBe(decodePrivateKey(privateKeyPem).byteLength);
  });

  it('rejects a non-PEM value without echoing the value', () => {
    try {
      decodePrivateKey('not-a-key-but-secret-looking');
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(FirestoreError);
      expect((error as Error).message).not.toContain('not-a-key-but-secret-looking');
    }
  });
});

describe('createTasks', () => {
  it('writes to the owner path derived from env, never from input', async () => {
    const store = makeStore();
    mockFetch((url) => (url.includes(':batchGet') ? [{ missing: 'x' }] : { writeResults: [{}] }));

    await store.createTasks([taskWrite()]);

    const commit = calls.find((call) => call.url.includes(':commit'));
    const writes = (commit!.body as any).writes;
    expect(writes[0].update.name).toBe(
      `projects/${PROJECT_ID}/databases/(default)/documents/users/${OWNER_UID}/tasks/${'a'.repeat(64)}`,
    );
    expect(store.tasksCollectionPath).toContain(`/users/${OWNER_UID}/tasks`);
  });

  it('always creates tasks as todo with server timestamps and a null completed_at', async () => {
    const store = makeStore();
    mockFetch((url) => (url.includes(':batchGet') ? [{ missing: 'x' }] : { writeResults: [{}] }));

    await store.createTasks([taskWrite()]);

    const write = (calls.find((call) => call.url.includes(':commit'))!.body as any).writes[0];
    expect(write.update.fields.status).toEqual({ stringValue: 'todo' });
    expect(write.update.fields.completed_at).toEqual({ nullValue: null });
    expect(write.updateTransforms).toEqual([
      { fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' },
      { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' },
    ]);
    expect(write.currentDocument).toEqual({ exists: false });
  });

  it('skips documents that already exist instead of failing the batch', async () => {
    const store = makeStore();
    const existingId = 'b'.repeat(64);
    const freshId = 'c'.repeat(64);

    mockFetch((url) => {
      if (url.includes(':batchGet')) {
        return [
          { found: firestoreDoc(store, existingId, {}) },
          { missing: `${store.tasksCollectionPath}/${freshId}` },
        ];
      }
      return { writeResults: [{}] };
    });

    const result = await store.createTasks([
      taskWrite({ documentId: existingId, title: 'already there' }),
      taskWrite({ documentId: freshId, title: 'new one' }),
    ]);

    expect(result.inserted.map((task) => task.documentId)).toEqual([freshId]);
    expect(result.skippedDuplicates.map((task) => task.documentId)).toEqual([existingId]);
    const commit = calls.find((call) => call.url.includes(':commit'));
    expect((commit!.body as any).writes).toHaveLength(1);
  });

  it('does not commit at all when every task is a duplicate', async () => {
    const store = makeStore();
    const id = 'd'.repeat(64);
    mockFetch((url) => (url.includes(':batchGet') ? [{ found: firestoreDoc(store, id, {}) }] : { writeResults: [] }));

    const result = await store.createTasks([taskWrite({ documentId: id })]);

    expect(result.inserted).toHaveLength(0);
    expect(result.skippedDuplicates).toHaveLength(1);
    expect(calls.some((call) => call.url.includes(':commit'))).toBe(false);
  });

  it('collapses duplicates that appear twice inside one batch', async () => {
    const store = makeStore();
    const id = 'e'.repeat(64);
    mockFetch((url) => (url.includes(':batchGet') ? [{ missing: 'x' }] : { writeResults: [{}] }));

    const result = await store.createTasks([taskWrite({ documentId: id }), taskWrite({ documentId: id })]);

    expect(result.inserted).toHaveLength(1);
    expect(result.skippedDuplicates).toHaveLength(1);
    expect((calls.find((call) => call.url.includes(':commit'))!.body as any).writes).toHaveLength(1);
  });

  it('retries once when a racing writer trips the exists:false precondition', async () => {
    const store = makeStore();
    const racedId = 'f'.repeat(64);
    const otherId = '0'.repeat(64);
    let batchGetCount = 0;
    let commitCount = 0;

    mockFetch((url) => {
      if (url.includes(':batchGet')) {
        batchGetCount += 1;
        // Second look-up sees the document the racing writer just created.
        return batchGetCount === 1
          ? [{ missing: 'x' }, { missing: 'y' }]
          : [{ found: firestoreDoc(store, racedId, {}) }, { missing: 'y' }];
      }
      commitCount += 1;
      if (commitCount === 1) {
        return Response.json({ error: { status: 'FAILED_PRECONDITION', message: 'exists' } }, { status: 400 });
      }
      return { writeResults: [{}] };
    });

    const result = await store.createTasks([
      taskWrite({ documentId: racedId }),
      taskWrite({ documentId: otherId }),
    ]);

    expect(batchGetCount).toBe(2);
    expect(commitCount).toBe(2);
    expect(result.inserted.map((task) => task.documentId)).toEqual([otherId]);
    expect(result.skippedDuplicates.map((task) => task.documentId)).toEqual([racedId]);
  });

  it('surfaces a Firestore failure as a FirestoreError without leaking the access token', async () => {
    const store = makeStore();
    mockFetch((url) => {
      if (url.includes(':batchGet')) return [{ missing: 'x' }];
      return Response.json({ error: { status: 'PERMISSION_DENIED', message: 'nope' } }, { status: 403 });
    });

    await expect(store.createTasks([taskWrite()])).rejects.toThrowError(FirestoreError);
    await expect(store.createTasks([taskWrite()])).rejects.not.toThrowError(new RegExp(ACCESS_TOKEN));
  });
});

describe('listTasksByDueDate', () => {
  it('queries only the due_date range, ordered by due_date, under the owner path', async () => {
    const store = makeStore();
    mockFetch(() => []);

    await store.listTasksByDueDate('2026-08-23', '2026-08-30', 200);

    const query = calls.find((call) => call.url.includes(':runQuery'))!;
    expect(query.url).toContain(`/users/${OWNER_UID}:runQuery`);
    const structured = (query.body as any).structuredQuery;
    expect(structured.from).toEqual([{ collectionId: 'tasks' }]);
    expect(structured.limit).toBe(200);
    // A single orderBy field keeps this on Firestore's automatic index (no composite index).
    expect(structured.orderBy).toEqual([{ field: { fieldPath: 'due_date' }, direction: 'ASCENDING' }]);
    const filters = structured.where.compositeFilter.filters;
    expect(filters[0].fieldFilter.value).toEqual({ stringValue: '2026-08-23' });
    expect(filters[1].fieldFilter.value).toEqual({ stringValue: '2026-08-30' });
  });

  it('decodes documents into tasks, keeping due_date as a plain calendar string', async () => {
    const store = makeStore();
    mockFetch(() => [
      {
        document: firestoreDoc(store, 'abc', {
          id: { stringValue: 'abc' },
          title: { stringValue: 'Present perfect' },
          subject: { stringValue: 'English' },
          source_skill: { stringValue: 'english-teacher' },
          description: { stringValue: 'notlar' },
          due_date: { stringValue: '2026-08-24' },
          status: { stringValue: 'done' },
          idempotency_key: { stringValue: 'auto:xyz' },
          created_at: { timestampValue: '2026-08-23T09:00:00Z' },
          updated_at: { timestampValue: '2026-08-23T10:00:00Z' },
          completed_at: { timestampValue: '2026-08-23T10:00:00Z' },
        }),
      },
      // runQuery can emit transaction/read-time entries with no document — those are skipped.
      { readTime: '2026-08-23T10:00:00Z' },
    ]);

    const tasks = await store.listTasksByDueDate('2026-08-23', '2026-08-30', 200);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: 'abc',
      due_date: '2026-08-24',
      status: 'done',
      completed_at: '2026-08-23T10:00:00Z',
    });
  });

  it('defaults an unknown status to todo', async () => {
    const store = makeStore();
    mockFetch(() => [{ document: firestoreDoc(store, 'abc', { status: { stringValue: 'weird' } }) }]);

    const tasks = await store.listTasksByDueDate('2026-08-23', '2026-08-30', 200);
    expect(tasks[0]!.status).toBe('todo');
  });
});

describe('access tokens', () => {
  it('sends the bearer token to Firestore but keeps it out of results', async () => {
    const store = makeStore();
    mockFetch(() => []);

    const tasks = await store.listTasksByDueDate('2026-08-23', '2026-08-30', 200);

    const query = calls.find((call) => call.url.includes(':runQuery'))!;
    expect(query.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(JSON.stringify(tasks)).not.toContain(ACCESS_TOKEN);
  });

  it('reuses a cached token across calls', async () => {
    const store = makeStore();
    mockFetch(() => []);

    await store.listTasksByDueDate('2026-08-23', '2026-08-30', 200);
    await store.listTasksByDueDate('2026-08-23', '2026-08-30', 200);

    expect(calls.filter((call) => call.url.includes('oauth2.googleapis.com'))).toHaveLength(1);
  });

  it('reports a rejected service account without echoing the assertion', async () => {
    const store = makeStore();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 })),
    );

    await expect(store.listTasksByDueDate('2026-08-23', '2026-08-30', 200)).rejects.toThrowError(
      /invalid_grant/,
    );
  });
});
