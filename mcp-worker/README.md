# ai-planner-mcp

Remote **Streamable HTTP** MCP server, running as a Cloudflare Worker, that lets Claude
teacher skills add study tasks to the AI Planner and list them back. It is the only piece
of this repo that talks to Firestore directly (via a service account); the browser never
sees Firestore admin credentials.

```
Claude.ai (web) → this Worker (/mcp) → Firestore users/{OWNER_UID}/tasks
```

For the full end-to-end setup (Firebase, GitHub OAuth App, Claude.ai connector, Vercel,
Render), see [`../SETUP_FREE.md`](../SETUP_FREE.md). This file only covers the Worker
itself.

## What it is

- TypeScript, Cloudflare Workers, `nodejs_compat` (needed by `@cloudflare/workers-oauth-provider`).
- MCP transport: **Streamable HTTP** via `WebStandardStreamableHTTPServerTransport` from
  the official `@modelcontextprotocol/sdk`, mounted stateless at `POST /mcp` — a fresh
  `McpServer` + transport per request, `sessionIdGenerator: undefined`,
  `enableJsonResponse: true`. No SSE endpoint, no `McpAgent`, no Durable Object: nothing
  here needs cross-request state beyond OAuth grants, and those live in KV.
- OAuth: `@cloudflare/workers-oauth-provider` (Cloudflare's own current library for
  building a remote-MCP authorization server) handles `/authorize`, `/token` and dynamic
  client registration at `/register`, and persists clients/grants/tokens in a `OAUTH_KV`
  Workers KV namespace. `src/auth.ts` is the "default handler" it delegates to for
  anything that isn't `/mcp`: it runs the GitHub OAuth dance and only completes the
  authorization if the GitHub account's **numeric** id matches `GITHUB_ALLOWED_USER_ID`.
- Firestore access: `src/firestore.ts` talks to the **Firestore REST API** directly,
  authenticating as a service account by signing a JWT with Web Crypto and exchanging it
  for a Google OAuth access token. No `firebase-admin` (too heavy / not Workers-friendly).
- Two tools only: `add_tasks`, `list_tasks`. No `update_task` / `complete_task` /
  `delete_task` — completion is a decision made by a human in the planner web app.

## Layout

```
src/
  index.ts      Worker entrypoint — wires OAuthProvider to auth.ts + mcp.ts. No other
                 exports: a Worker's main module may only export `default`.
  auth.ts        GitHub OAuth "default handler": /authorize, /callback, /health, /.
  mcp.ts         Authenticated /mcp handler: re-checks the GitHub id, builds a fresh
                 McpServer + Streamable HTTP transport per request.
  tools.ts       add_tasks / list_tasks tool definitions and their handlers.
  firestore.ts   Firestore REST client (service-account JWT, batchGet/commit/runQuery).
  schemas.ts     Zod input schemas, normalization, deterministic idempotency keys.
  types.ts       Env bindings and shared types.
test/            Vitest suite — see "Testing" below.
```

## Prerequisites

- Node.js 20+
- A Cloudflare account (`npx wrangler login`)
- The Firebase and GitHub OAuth App setup described in `../SETUP_FREE.md`

## Local development

```bash
cd mcp-worker
npm install
cp .dev.vars.example .dev.vars   # fill in real values — this file is git-ignored
npm run dev                      # wrangler dev
```

`wrangler dev` prints a local URL (e.g. `http://127.0.0.1:8787`). Useful checks:

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/.well-known/oauth-authorization-server
curl -i -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# → 401 Unauthorized without a valid access token, as expected.
```

Full OAuth + `add_tasks`/`list_tasks` calls are easiest to exercise end-to-end from
Claude.ai once deployed (`../SETUP_FREE.md` § 5) rather than by hand-rolling the OAuth
dance with curl.

## Testing

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run — no network, no real Firebase/GitHub
```

The suite mocks `fetch` for both the Google OAuth token endpoint and the Firestore REST
API, and generates a throwaway RSA key pair per run for the service-account JWT signing
path — no real credentials are needed or used. Coverage includes: `add_tasks`/`list_tasks`
input validation and limits, deterministic idempotency-key derivation (including that an
explicit `idempotency_key` can never collide with a derived one), duplicate handling
(including a simulated create-race retry), the owner path always being built from env
(never from tool input), GitHub OAuth state signing/CSRF, the numeric-id allowlist check,
and that no test asserts on or leaks a secret/token value.

## Deploying

```bash
npx wrangler login
npx wrangler kv namespace create OAUTH_KV     # paste the id into wrangler.jsonc
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_ALLOWED_USER_ID
npx wrangler secret put COOKIE_ENCRYPTION_KEY
npx wrangler secret put FIREBASE_PROJECT_ID
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
npx wrangler secret put FIREBASE_OWNER_UID
npm run deploy                                # wrangler deploy
```

`wrangler deploy` prints the deployed URL, typically
`https://ai-planner-mcp.<your-subdomain>.workers.dev` (from `name` in `wrangler.jsonc`).
That URL + `/mcp` is what you add as a custom connector in Claude.ai — see
`../SETUP_FREE.md` § 5 for the exact steps. This project does not deploy itself; running
`wrangler deploy` is a step you take deliberately.

## Routes

| Route | Method | Purpose |
|---|---|---|
| `/mcp` | POST | The MCP endpoint. Requires a valid OAuth bearer token for the allow-listed GitHub account. |
| `/authorize` | GET, POST | OAuth authorization: GET shows an approval screen, POST redirects to GitHub. |
| `/callback` | GET | GitHub OAuth callback. Must match the GitHub OAuth App's "Authorization callback URL" exactly. |
| `/token` | POST | OAuth token endpoint (issuance, refresh, revocation) — implemented by `@cloudflare/workers-oauth-provider`. |
| `/register` | POST | Dynamic client registration (RFC 7591) — how Claude.ai registers itself. |
| `/.well-known/oauth-authorization-server` | GET | OAuth 2.0 Authorization Server Metadata. |
| `/.well-known/oauth-protected-resource/mcp` | GET | RFC 9728 Protected Resource Metadata for `/mcp`. |
| `/health` | GET | Liveness only — reports which secrets are *present*, never their values. |

## Security notes

- The service account bypasses Firestore Security Rules entirely, so this Worker is the
  only thing standing between a tool call and the database. `src/firestore.ts` always
  builds the `users/{FIREBASE_OWNER_UID}/tasks` path from the Worker's own env — never
  from MCP tool input — and only that one collection is ever read or written.
- New tasks are always written with `status: "todo"`, server-timestamped `created_at` /
  `updated_at`, and `completed_at: null`. `add_tasks` cannot set any of those fields.
- Access is gated on the GitHub account's **numeric** id (immutable), not its username.
- The GitHub OAuth flow uses a signed, time-limited state (HMAC over
  `COOKIE_ENCRYPTION_KEY`) plus a `HttpOnly`/`Secure`/`SameSite=Lax` nonce cookie for CSRF
  protection, verified with a constant-time comparison.
- Error responses are written to never include a secret, access token, or the allow-listed
  GitHub id.
