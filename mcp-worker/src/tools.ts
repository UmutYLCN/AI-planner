/**
 * The two MCP tools this server exposes.
 *
 * Deliberately write-once + read-only: there is no update/complete/delete tool, because
 * completing a task is a decision the human makes in the planner UI, not something a
 * skill should be able to do on their behalf.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { FirestoreError, FirestoreTaskStore, readFirestoreConfig, type TaskWrite } from './firestore.js';
import {
  MAX_LIST_RESULTS,
  MAX_RANGE_DAYS,
  MAX_TASKS_PER_CALL,
  PLANNER_TIMEZONE,
  addTasksInputShape,
  addTasksInputSchema,
  formatValidationError,
  listTasksInputShape,
  listTasksInputSchema,
  normalizeTaskInput,
  resolveTaskIdentity,
} from './schemas.js';
import type { CloudTask, Env } from './types.js';

export const SERVER_VERSION = '1.0.0';

const taskSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  subject: z.string(),
  source_skill: z.string(),
  due_date: z.string(),
  idempotency_key: z.string(),
});

const addTasksOutputShape = {
  inserted: z.number().int(),
  skipped_duplicates: z.number().int(),
  tasks: z.array(taskSummarySchema),
  skipped: z.array(taskSummarySchema),
};

const listedTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  subject: z.string(),
  source_skill: z.string(),
  description: z.string(),
  due_date: z.string(),
  status: z.enum(['todo', 'done']),
});

const listTasksOutputShape = {
  count: z.number().int(),
  truncated: z.boolean(),
  tasks: z.array(listedTaskSchema),
};

/** Wraps structured data as a tool result, mirroring it as text for non-structured clients. */
function ok(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

/** A failed tool call. Messages here are safe to show a model — never secrets or stack traces. */
function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Converts any thrown value into a message that cannot carry credentials. */
function describeError(error: unknown): string {
  if (error instanceof FirestoreError) return error.message;
  return 'The planner backend is temporarily unavailable. Please try again.';
}

function summarize(task: TaskWrite) {
  return {
    id: task.documentId,
    title: task.title,
    subject: task.subject,
    source_skill: task.source_skill,
    due_date: task.due_date,
    idempotency_key: task.idempotencyKey,
  };
}

function toListed(task: CloudTask) {
  return {
    id: task.id,
    title: task.title,
    subject: task.subject,
    source_skill: task.source_skill,
    description: task.description,
    due_date: task.due_date,
    status: task.status,
  };
}

/** Stable ordering for the list result: due_date, then creation time, then id. */
function compareTasks(a: CloudTask, b: CloudTask): number {
  if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  const createdA = a.created_at ?? '';
  const createdB = b.created_at ?? '';
  if (createdA !== createdB) return createdA < createdB ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Builds a fresh MCP server. One instance per HTTP request (stateless mode) — never
 * shared between requests.
 */
export function createMcpServer(env: Env): McpServer {
  const server = new McpServer(
    {
      name: env.MCP_SERVER_NAME?.trim() || 'ai-planner',
      title: 'AI Planner Tasks',
      version: SERVER_VERSION,
    },
    {
      // Ajv compiles schemas with `new Function`, which Workers forbid.
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
      instructions:
        'Study tasks for a single planner user. Use list_tasks to check what already exists for a date range before calling add_tasks. Tasks can only be created and read here; the user completes them in the planner web app.',
    },
  );

  // The store is created lazily so a config error surfaces as a tool error rather than
  // breaking `tools/list` and hiding the server from the connector entirely.
  let store: FirestoreTaskStore | null = null;
  const getStore = (): FirestoreTaskStore => {
    if (!store) store = new FirestoreTaskStore(readFirestoreConfig(env));
    return store;
  };

  server.registerTool(
    'add_tasks',
    {
      title: 'Add study tasks',
      description:
        `Create between 1 and ${MAX_TASKS_PER_CALL} study tasks in the user's planner. ` +
        `Every task is created with status "todo"; you cannot set status or any timestamp. ` +
        `due_date is a ${PLANNER_TIMEZONE} calendar day in YYYY-MM-DD form. ` +
        'Re-sending an identical task is skipped rather than duplicated, so retries are safe. ' +
        'Only add tasks the user has actually agreed to.',
      inputSchema: addTasksInputShape,
      outputSchema: addTasksOutputShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (rawInput): Promise<CallToolResult> => {
      const parsed = addTasksInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail(`Invalid input — ${formatValidationError(parsed.error)}`);

      const writes: TaskWrite[] = [];
      for (const task of parsed.data.tasks) {
        const normalized = normalizeTaskInput(task);
        const identity = await resolveTaskIdentity(normalized);
        writes.push({
          documentId: identity.documentId,
          idempotencyKey: identity.idempotencyKey,
          title: normalized.title,
          subject: normalized.subject,
          source_skill: normalized.source_skill,
          description: normalized.description,
          due_date: normalized.due_date,
        });
      }

      try {
        const result = await getStore().createTasks(writes);
        return ok({
          inserted: result.inserted.length,
          skipped_duplicates: result.skippedDuplicates.length,
          tasks: result.inserted.map(summarize),
          skipped: result.skippedDuplicates.map(summarize),
        });
      } catch (error) {
        return fail(describeError(error));
      }
    },
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List planner tasks',
      description:
        `Read the user's planner tasks whose due_date falls inside an inclusive ${PLANNER_TIMEZONE} ` +
        `date range (at most ${MAX_RANGE_DAYS} days, at most ${MAX_LIST_RESULTS} tasks). ` +
        'Optional source_skill and status filters are applied to that result window. Read-only.',
      inputSchema: listTasksInputShape,
      outputSchema: listTasksOutputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (rawInput): Promise<CallToolResult> => {
      const parsed = listTasksInputSchema.safeParse(rawInput);
      if (!parsed.success) return fail(`Invalid input — ${formatValidationError(parsed.error)}`);

      const { from, to, source_skill: sourceSkill, status } = parsed.data;

      try {
        const scanned = await getStore().listTasksByDueDate(from, to, MAX_LIST_RESULTS);
        const filtered = scanned
          .filter((task) => (sourceSkill ? task.source_skill === sourceSkill.trim() : true))
          .filter((task) => (status ? task.status === status : true))
          .sort(compareTasks);

        return ok({
          count: filtered.length,
          // The date-range scan itself hit the cap, so tasks may exist beyond this window.
          truncated: scanned.length >= MAX_LIST_RESULTS,
          tasks: filtered.map(toListed),
        });
      } catch (error) {
        return fail(describeError(error));
      }
    },
  );

  return server;
}
