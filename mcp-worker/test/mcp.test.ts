import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MCP_ROUTE, mcpApiHandler } from '../src/mcp.js';
import { clearAccessTokenCache } from '../src/firestore.js';
import type { AuthedExecutionContext, Env } from '../src/types.js';
import { generateTestPrivateKeyPem } from './helpers/testKeys.js';

const ALLOWED_GITHUB_ID = '4242424242';
const OWNER_UID = 'ownerUid123';
const ACCESS_TOKEN = 'ya29.super-secret-access-token';

let privateKeyPem: string;

beforeAll(async () => {
  privateKeyPem = await generateTestPrivateKeyPem();
});

function makeEnv(): Env {
  return {
    OAUTH_KV: {} as KVNamespace,
    GITHUB_CLIENT_ID: 'Iv1.testclientid',
    GITHUB_CLIENT_SECRET: 'secret',
    GITHUB_ALLOWED_USER_ID: ALLOWED_GITHUB_ID,
    COOKIE_ENCRYPTION_KEY: 'test-cookie-encryption-key-0123456789',
    FIREBASE_PROJECT_ID: 'ai-planner-test',
    FIREBASE_CLIENT_EMAIL: 'planner@ai-planner-test.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: privateKeyPem,
    FIREBASE_OWNER_UID: OWNER_UID,
  };
}

function makeCtx(props?: unknown): AuthedExecutionContext {
  return {
    props,
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as AuthedExecutionContext;
}

let firestoreCalls: Array<{ url: string; body: any }> = [];

function mockFirestore(responder: (url: string, body: any) => unknown | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        return Response.json({ access_token: ACCESS_TOKEN, expires_in: 3600 });
      }
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      firestoreCalls.push({ url, body });
      const result = responder(url, body);
      return result instanceof Response ? result : Response.json(result);
    }),
  );
}

let nextId = 1;

const AUTHORIZED_PROPS = { githubUserId: ALLOWED_GITHUB_ID, githubLogin: 'owner' };

/** Sends one JSON-RPC message to the Streamable HTTP endpoint as the given caller. */
async function callMcpAs(props: unknown, method: string, params?: unknown) {
  const request = new Request(`https://mcp.example.workers.dev${MCP_ROUTE}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params: params ?? {} }),
  });

  const response = await mcpApiHandler.fetch(request, makeEnv(), makeCtx(props));
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** Sends one JSON-RPC message as the allow-listed GitHub account. */
async function callMcp(method: string, params?: unknown) {
  return callMcpAs(AUTHORIZED_PROPS, method, params);
}

beforeEach(() => {
  firestoreCalls = [];
  clearAccessTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('authorization', () => {
  it('rejects a request with no OAuth props', async () => {
    const { status, body } = await callMcpAs(undefined, 'tools/list');
    expect(status).toBe(401);
    expect(body.error.message).toContain('Unauthorized');
  });

  it('rejects props for a different GitHub account', async () => {
    const { status } = await callMcpAs({ githubUserId: '999', githubLogin: 'someone' }, 'tools/list');
    expect(status).toBe(401);
  });

  it('rejects malformed props', async () => {
    for (const props of [null, {}, { githubUserId: '' }, { githubUserId: 42 }, 'string']) {
      const { status } = await callMcpAs(props, 'tools/list');
      expect(status, JSON.stringify(props)).toBe(401);
    }
  });

  it('never reaches Firestore for an unauthorized request', async () => {
    mockFirestore(() => []);
    await callMcpAs(undefined, 'tools/call', {
      name: 'list_tasks',
      arguments: { from: '2026-08-23', to: '2026-08-24' },
    });
    expect(firestoreCalls).toHaveLength(0);
  });

  it('does not echo the allowed GitHub id in the 401 body', async () => {
    const { body } = await callMcpAs(undefined, 'tools/list');
    expect(JSON.stringify(body)).not.toContain(ALLOWED_GITHUB_ID);
  });

  it('404s a path other than /mcp', async () => {
    const response = await mcpApiHandler.fetch(
      new Request('https://mcp.example.workers.dev/other', { method: 'POST' }),
      makeEnv(),
      makeCtx({ githubUserId: ALLOWED_GITHUB_ID }),
    );
    expect(response.status).toBe(404);
  });
});

describe('tools/list', () => {
  it('exposes exactly add_tasks and list_tasks', async () => {
    const { body } = await callMcp('tools/list');
    const names = body.result.tools.map((tool: { name: string }) => tool.name).sort();
    expect(names).toEqual(['add_tasks', 'list_tasks']);
  });

  it('exposes no mutating tool beyond creation', async () => {
    const { body } = await callMcp('tools/list');
    const names: string[] = body.result.tools.map((tool: { name: string }) => tool.name);
    for (const forbidden of ['update_task', 'complete_task', 'delete_task']) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('does not expose status or timestamps as add_tasks inputs', async () => {
    const { body } = await callMcp('tools/list');
    const addTasks = body.result.tools.find((tool: { name: string }) => tool.name === 'add_tasks');
    const taskProperties = addTasks.inputSchema.properties.tasks.items.properties;
    expect(Object.keys(taskProperties).sort()).toEqual([
      'description',
      'due_date',
      'idempotency_key',
      'source_skill',
      'subject',
      'title',
    ]);
  });
});

describe('add_tasks', () => {
  it('creates a task and reports it as inserted', async () => {
    mockFirestore((url) => (url.includes(':batchGet') ? [{ missing: 'x' }] : { writeResults: [{}] }));

    const { body } = await callMcp('tools/call', {
      name: 'add_tasks',
      arguments: {
        tasks: [
          {
            title: 'Present perfect tense tekrar et',
            subject: 'English',
            source_skill: 'english-teacher',
            description: 'Konu notlarini gozden gecir ve 20 soru coz.',
            due_date: '2026-08-24',
            idempotency_key: 'english-teacher:2026-08-24:present-perfect-review',
          },
        ],
      },
    });

    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent).toMatchObject({ inserted: 1, skipped_duplicates: 0 });
    expect(body.result.structuredContent.tasks[0].due_date).toBe('2026-08-24');
  });

  it('is idempotent when the same task is re-sent', async () => {
    // Every requested document already exists.
    mockFirestore((url, body) =>
      url.includes(':batchGet')
        ? body.documents.map((name: string) => ({ found: { name, fields: {} } }))
        : { writeResults: [{}] },
    );

    const { body } = await callMcp('tools/call', {
      name: 'add_tasks',
      arguments: {
        tasks: [
          { title: 'Tekrar', subject: 'English', source_skill: 'english-teacher', due_date: '2026-08-24' },
        ],
      },
    });

    expect(body.result.structuredContent).toMatchObject({ inserted: 0, skipped_duplicates: 1 });
    expect(firestoreCalls.some((call) => call.url.includes(':commit'))).toBe(false);
  });

  it('rejects an empty batch before touching Firestore', async () => {
    mockFirestore(() => []);
    const { body } = await callMcp('tools/call', { name: 'add_tasks', arguments: { tasks: [] } });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('at least one task');
    expect(firestoreCalls).toHaveLength(0);
  });

  it('rejects more than 50 tasks before touching Firestore', async () => {
    mockFirestore(() => []);
    const tasks = Array.from({ length: 51 }, (_, index) => ({
      title: `Task ${index}`,
      subject: 'English',
      source_skill: 'english-teacher',
      due_date: '2026-08-24',
    }));

    const { body } = await callMcp('tools/call', { name: 'add_tasks', arguments: { tasks } });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('at most 50 tasks');
    expect(firestoreCalls).toHaveLength(0);
  });

  it('rejects an invalid due_date', async () => {
    mockFirestore(() => []);
    const { body } = await callMcp('tools/call', {
      name: 'add_tasks',
      arguments: {
        tasks: [{ title: 'x', subject: 'English', source_skill: 'english-teacher', due_date: '24/08/2026' }],
      },
    });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('due_date');
    expect(firestoreCalls).toHaveLength(0);
  });

  it('ignores status/created_at supplied by the caller', async () => {
    mockFirestore((url) => (url.includes(':batchGet') ? [{ missing: 'x' }] : { writeResults: [{}] }));

    await callMcp('tools/call', {
      name: 'add_tasks',
      arguments: {
        tasks: [
          {
            title: 'Tekrar',
            subject: 'English',
            source_skill: 'english-teacher',
            due_date: '2026-08-24',
            status: 'done',
            created_at: '2000-01-01T00:00:00Z',
            completed_at: '2000-01-01T00:00:00Z',
          },
        ],
      },
    });

    const write = firestoreCalls.find((call) => call.url.includes(':commit'))!.body.writes[0];
    expect(write.update.fields.status).toEqual({ stringValue: 'todo' });
    expect(write.update.fields.completed_at).toEqual({ nullValue: null });
    expect(write.updateTransforms.map((t: { fieldPath: string }) => t.fieldPath)).toEqual(['created_at', 'updated_at']);
  });

  it('builds the Firestore path from env, never from tool input', async () => {
    mockFirestore((url) => (url.includes(':batchGet') ? [{ missing: 'x' }] : { writeResults: [{}] }));

    await callMcp('tools/call', {
      name: 'add_tasks',
      arguments: {
        tasks: [
          {
            title: 'Tekrar',
            subject: 'English',
            source_skill: 'english-teacher',
            due_date: '2026-08-24',
            // Path-shaped input that must be ignored entirely.
            userId: 'attacker',
            collection: 'secrets',
            path: 'users/attacker/tasks',
          },
        ],
      },
    });

    const write = firestoreCalls.find((call) => call.url.includes(':commit'))!.body.writes[0];
    expect(write.update.name).toContain(`/users/${OWNER_UID}/tasks/`);
    expect(write.update.name).not.toContain('attacker');
    expect(write.update.name).not.toContain('secrets');
    expect(Object.keys(write.update.fields).sort()).toEqual([
      'completed_at',
      'description',
      'due_date',
      'id',
      'idempotency_key',
      'source_skill',
      'status',
      'subject',
      'title',
    ]);
  });

  it('reports a Firestore failure without leaking the access token', async () => {
    mockFirestore((url) => {
      if (url.includes(':batchGet')) return [{ missing: 'x' }];
      return Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 });
    });

    const { body } = await callMcp('tools/call', {
      name: 'add_tasks',
      arguments: {
        tasks: [{ title: 'Tekrar', subject: 'English', source_skill: 'english-teacher', due_date: '2026-08-24' }],
      },
    });

    expect(body.result.isError).toBe(true);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain('BEGIN PRIVATE KEY');
  });
});

describe('list_tasks', () => {
  function taskDocument(id: string, fields: Record<string, string>) {
    return {
      document: {
        name: `projects/ai-planner-test/databases/(default)/documents/users/${OWNER_UID}/tasks/${id}`,
        fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { stringValue: value }])),
      },
    };
  }

  it('returns tasks in the requested range', async () => {
    mockFirestore(() => [
      taskDocument('t1', { id: 't1', title: 'A', subject: 'English', source_skill: 'english-teacher', due_date: '2026-08-24', status: 'todo' }),
      taskDocument('t2', { id: 't2', title: 'B', subject: 'Math', source_skill: 'math-teacher', due_date: '2026-08-25', status: 'done' }),
    ]);

    const { body } = await callMcp('tools/call', {
      name: 'list_tasks',
      arguments: { from: '2026-08-23', to: '2026-08-30' },
    });

    expect(body.result.structuredContent.count).toBe(2);
    expect(body.result.structuredContent.truncated).toBe(false);
    expect(body.result.structuredContent.tasks.map((task: { id: string }) => task.id)).toEqual(['t1', 't2']);
  });

  it('applies the optional source_skill and status filters', async () => {
    mockFirestore(() => [
      taskDocument('t1', { id: 't1', title: 'A', subject: 'English', source_skill: 'english-teacher', due_date: '2026-08-24', status: 'todo' }),
      taskDocument('t2', { id: 't2', title: 'B', subject: 'Math', source_skill: 'math-teacher', due_date: '2026-08-24', status: 'todo' }),
      taskDocument('t3', { id: 't3', title: 'C', subject: 'English', source_skill: 'english-teacher', due_date: '2026-08-24', status: 'done' }),
    ]);

    const { body } = await callMcp('tools/call', {
      name: 'list_tasks',
      arguments: { from: '2026-08-23', to: '2026-08-30', source_skill: 'english-teacher', status: 'todo' },
    });

    expect(body.result.structuredContent.tasks.map((task: { id: string }) => task.id)).toEqual(['t1']);
  });

  it('caps the Firestore scan at 200 documents', async () => {
    mockFirestore(() => []);
    await callMcp('tools/call', { name: 'list_tasks', arguments: { from: '2026-08-23', to: '2026-08-30' } });

    const query = firestoreCalls.find((call) => call.url.includes(':runQuery'))!;
    expect(query.body.structuredQuery.limit).toBe(200);
  });

  it('flags a truncated result when the scan hits the cap', async () => {
    mockFirestore(() =>
      Array.from({ length: 200 }, (_, index) =>
        taskDocument(`t${index}`, {
          id: `t${index}`,
          title: 'A',
          subject: 'English',
          source_skill: 'english-teacher',
          due_date: '2026-08-24',
          status: 'todo',
        }),
      ),
    );

    const { body } = await callMcp('tools/call', {
      name: 'list_tasks',
      arguments: { from: '2026-08-23', to: '2026-08-30' },
    });

    expect(body.result.structuredContent.count).toBe(200);
    expect(body.result.structuredContent.truncated).toBe(true);
  });

  it('rejects a range longer than 90 days before querying', async () => {
    mockFirestore(() => []);
    const { body } = await callMcp('tools/call', {
      name: 'list_tasks',
      arguments: { from: '2026-01-01', to: '2026-06-01' },
    });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('90 days');
    expect(firestoreCalls).toHaveLength(0);
  });

  it('always queries under the owner path, ignoring path-shaped input', async () => {
    mockFirestore(() => []);
    await callMcp('tools/call', {
      name: 'list_tasks',
      arguments: { from: '2026-08-23', to: '2026-08-30', userId: 'attacker', collection: 'secrets' },
    });

    const query = firestoreCalls.find((call) => call.url.includes(':runQuery'))!;
    expect(query.url).toContain(`/users/${OWNER_UID}:runQuery`);
    expect(query.url).not.toContain('attacker');
    expect(query.body.structuredQuery.from).toEqual([{ collectionId: 'tasks' }]);
  });
});
