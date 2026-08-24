/**
 * Shared types for the AI Planner remote MCP Worker.
 */

/** Worker bindings. Every credential here is a Wrangler secret, never a `var`. */
export interface Env {
  /** KV namespace used by @cloudflare/workers-oauth-provider for clients/grants/tokens. */
  OAUTH_KV: KVNamespace;

  /** GitHub OAuth App credentials. */
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Numeric GitHub user id (as a string) of the single allowed operator. */
  GITHUB_ALLOWED_USER_ID: string;
  /** Random secret used to sign the OAuth approval/state cookie. */
  COOKIE_ENCRYPTION_KEY: string;

  /** Firebase service account + the single planner owner. */
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  FIREBASE_OWNER_UID: string;

  /** Non-secret display name advertised over MCP. */
  MCP_SERVER_NAME?: string;
}

/**
 * Values persisted with an OAuth grant and handed to the MCP handler as `ctx.props`.
 * Deliberately does NOT carry the GitHub access token — the Worker has no reason to
 * keep acting on the user's behalf after the identity check.
 */
export interface AuthProps {
  githubUserId: string;
  githubLogin: string;
}

/** Task shape as stored in Firestore and returned by `list_tasks`. */
export interface CloudTask {
  id: string;
  title: string;
  subject: string;
  source_skill: string;
  description: string;
  due_date: string;
  status: 'todo' | 'done';
  idempotency_key: string;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
}

/** ExecutionContext with the props the OAuth provider injects for authenticated API requests. */
export type AuthedExecutionContext = ExecutionContext & { props?: unknown };
