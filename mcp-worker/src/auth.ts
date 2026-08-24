/**
 * GitHub OAuth "default handler" for @cloudflare/workers-oauth-provider.
 *
 * Flow:
 *   Claude.ai -> GET  /authorize   (approval screen naming the connecting client)
 *             -> POST /authorize   (signed state + nonce cookie, redirect to GitHub)
 *             -> GET  /callback    (verify state, exchange code, check GitHub user id)
 *             -> back to Claude.ai with an authorization code
 *
 * Only the single numeric GitHub user id in `GITHUB_ALLOWED_USER_ID` is ever granted
 * access. Error pages never reveal that id, any token, or any secret.
 */
import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import type { Env } from './types.js';
import { SERVER_VERSION } from './tools.js';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const USER_AGENT = 'ai-planner-mcp-worker';
const STATE_TTL_MS = 10 * 60 * 1000;
const NONCE_COOKIE = 'ai_planner_oauth_nonce';
const REQUEST_TIMEOUT_MS = 10_000;

type EnvWithOAuth = Env & { OAUTH_PROVIDER: OAuthHelpers };

// ── Signed state ─────────────────────────────────────────────────────────────

interface StatePayload {
  authRequest: AuthRequest;
  nonce: string;
  issuedAt: number;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 16) {
    throw new Error('COOKIE_ENCRYPTION_KEY is missing or too short.');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signState(payload: StatePayload, secret: string): Promise<string> {
  const body = base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

export async function verifyState(state: string, secret: string): Promise<StatePayload | null> {
  const separator = state.lastIndexOf('.');
  if (separator <= 0) return null;
  const body = state.slice(0, separator);
  const signature = state.slice(separator + 1);

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      base64UrlDecodeBytes(signature) as unknown as ArrayBuffer,
      new TextEncoder().encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let parsed: StatePayload;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(body))) as StatePayload;
  } catch {
    return null;
  }

  if (
    typeof parsed?.nonce !== 'string' ||
    typeof parsed?.issuedAt !== 'number' ||
    typeof parsed?.authRequest?.clientId !== 'string'
  ) {
    return null;
  }
  if (Date.now() - parsed.issuedAt > STATE_TTL_MS) return null;
  return parsed;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function randomToken(): string {
  return base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(24)));
}

/** Constant-time-ish string compare, so a nonce cannot be probed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PAGE_STYLE = `
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#F4F1FA; color:#332F3A; padding:24px;
         font-family: "DM Sans", system-ui, -apple-system, sans-serif; }
  .card { background:#fff; border:3px solid #332F3A; border-radius:24px; box-shadow:6px 6px 0 #332F3A;
          padding:32px; max-width:440px; width:100%; }
  h1 { font-size:22px; margin:0 0 8px; }
  p  { font-size:14px; line-height:1.6; color:#635F69; margin:0 0 12px; }
  dl { margin:16px 0; font-size:13px; }
  dt { font-weight:700; color:#635F69; margin-top:10px; }
  dd { margin:2px 0 0; word-break:break-all; }
  button { width:100%; padding:14px; font-size:15px; font-weight:800; color:#fff; cursor:pointer;
           background:linear-gradient(135deg,#A78BFA,#7C3AED); border:3px solid #332F3A;
           border-radius:16px; box-shadow:4px 4px 0 #332F3A; font-family:inherit; }
  button:active { transform:translate(2px,2px); box-shadow:2px 2px 0 #332F3A; }
  .note { font-size:12px; color:#8b8794; margin-top:16px; }
`;

function htmlPage(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>` +
      `<body><main class="card">${body}</main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

function errorPage(title: string, detail: string, status: number): Response {
  return htmlPage(
    title,
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>`,
    status,
  );
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function approvalPage(request: AuthRequest, clientName: string, state: string): Response {
  return htmlPage(
    'Connect AI Planner',
    `<h1>Connect to AI Planner</h1>
     <p>An MCP client wants permission to add and read study tasks in your planner.
        Continue only if you started this from a client you trust.</p>
     <dl>
       <dt>Client</dt><dd>${escapeHtml(clientName)}</dd>
       <dt>Redirects to</dt><dd>${escapeHtml(request.redirectUri)}</dd>
     </dl>
     <form method="POST" action="/authorize">
       <input type="hidden" name="state" value="${escapeHtml(state)}">
       <button type="submit">Continue with GitHub</button>
     </form>
     <p class="note">Access is limited to one pre-approved GitHub account.</p>`,
  );
}

async function handleAuthorizeGet(request: Request, env: EnvWithOAuth): Promise<Response> {
  let authRequest: AuthRequest;
  try {
    authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch {
    return errorPage('Invalid request', 'This authorization request is malformed or incomplete.', 400);
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId).catch(() => null);
  if (!client) {
    return errorPage('Unknown client', 'This OAuth client is not registered with the planner MCP server.', 400);
  }

  const state = await signState({ authRequest, nonce: randomToken(), issuedAt: Date.now() }, env.COOKIE_ENCRYPTION_KEY);
  return approvalPage(authRequest, client.clientName || authRequest.clientId, state);
}

async function handleAuthorizePost(request: Request, env: EnvWithOAuth): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const state = form?.get('state');
  if (typeof state !== 'string') {
    return errorPage('Invalid request', 'The approval form was submitted without a valid state.', 400);
  }

  const payload = await verifyState(state, env.COOKIE_ENCRYPTION_KEY);
  if (!payload) {
    return errorPage('Session expired', 'This approval link is no longer valid. Start the connection again.', 400);
  }

  const redirectUri = new URL('/callback', request.url).toString();
  const githubUrl = new URL(GITHUB_AUTHORIZE_URL);
  githubUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set('redirect_uri', redirectUri);
  githubUrl.searchParams.set('scope', 'read:user');
  githubUrl.searchParams.set('state', state);
  githubUrl.searchParams.set('allow_signup', 'false');

  return new Response(null, {
    status: 302,
    headers: {
      location: githubUrl.toString(),
      // Double-submit CSRF binding: the callback only accepts a state whose nonce also
      // arrives in this cookie, so a state pasted into another browser is useless.
      'set-cookie': `${NONCE_COOKIE}=${payload.nonce}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
      'cache-control': 'no-store',
    },
  });
}

async function fetchJson(url: string, init: RequestInit, what: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new Error(`${what} request failed.`);
  }
  if (!response.ok) throw new Error(`${what} request failed (${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${what} returned a malformed response.`);
  }
}

/** Exchanges a GitHub authorization code for the authenticated user's numeric id + login. */
export async function fetchGitHubUser(
  code: string,
  redirectUri: string,
  env: Pick<Env, 'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET'>,
): Promise<{ id: string; login: string }> {
  const tokenBody = (await fetchJson(
    GITHUB_TOKEN_URL,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    },
    'GitHub token',
  )) as { access_token?: unknown; error?: unknown };

  if (typeof tokenBody.access_token !== 'string' || tokenBody.access_token.length === 0) {
    // `tokenBody.error` is a coarse GitHub code; the token itself is never surfaced.
    throw new Error('GitHub did not return an access token for this authorization code.');
  }

  const user = (await fetchJson(
    GITHUB_USER_URL,
    {
      headers: {
        authorization: `Bearer ${tokenBody.access_token}`,
        accept: 'application/vnd.github+json',
        'user-agent': USER_AGENT,
      },
    },
    'GitHub user',
  )) as { id?: unknown; login?: unknown };

  if (typeof user.id !== 'number' || !Number.isInteger(user.id) || typeof user.login !== 'string') {
    throw new Error('GitHub returned an unexpected user payload.');
  }

  return { id: String(user.id), login: user.login };
}

/** True only when the authenticated GitHub account is the single allowed operator. */
export function isAllowedGitHubUser(userId: string, allowedUserId: string | undefined): boolean {
  const allowed = (allowedUserId ?? '').trim();
  if (!/^\d+$/.test(allowed)) return false;
  return timingSafeEqual(userId, allowed);
}

async function handleCallback(request: Request, env: EnvWithOAuth): Promise<Response> {
  const url = new URL(request.url);
  const clearCookie = `${NONCE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

  if (url.searchParams.get('error')) {
    return errorPage('Authorization cancelled', 'GitHub did not complete the authorization.', 400);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return errorPage('Invalid callback', 'The GitHub callback is missing required parameters.', 400);
  }

  const payload = await verifyState(state, env.COOKIE_ENCRYPTION_KEY);
  if (!payload) {
    return errorPage('Session expired', 'This sign-in attempt is no longer valid. Start the connection again.', 400);
  }

  const cookieNonce = readCookie(request, NONCE_COOKIE);
  if (!cookieNonce || !timingSafeEqual(cookieNonce, payload.nonce)) {
    return errorPage('Session mismatch', 'This sign-in could not be verified. Start the connection again.', 400);
  }

  let user: { id: string; login: string };
  try {
    user = await fetchGitHubUser(code, new URL('/callback', request.url).toString(), env);
  } catch {
    return errorPage('GitHub sign-in failed', 'Could not verify your GitHub account. Please try again.', 502);
  }

  if (!isAllowedGitHubUser(user.id, env.GITHUB_ALLOWED_USER_ID)) {
    // Says nothing about which account *is* allowed.
    return errorPage('Access denied', 'This GitHub account is not authorized to use this planner MCP server.', 403);
  }

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: payload.authRequest,
    userId: user.id,
    metadata: { label: user.login },
    scope: payload.authRequest.scope,
    props: { githubUserId: user.id, githubLogin: user.login },
  });

  return new Response(null, {
    status: 302,
    headers: { location: redirectTo, 'set-cookie': clearCookie, 'cache-control': 'no-store' },
  });
}

/**
 * Liveness only. Reports whether each secret is *present*, never its value, so a
 * misconfigured deployment is diagnosable without leaking anything.
 */
function handleHealth(env: Env): Response {
  const configured = {
    github_oauth: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_ALLOWED_USER_ID),
    cookie_key: Boolean(env.COOKIE_ENCRYPTION_KEY),
    firebase: Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY),
    owner_uid: Boolean(env.FIREBASE_OWNER_UID),
    oauth_kv: Boolean(env.OAUTH_KV),
  };
  return Response.json(
    { status: 'ok', service: 'ai-planner-mcp', version: SERVER_VERSION, transport: 'streamable-http', configured },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const typedEnv = env as EnvWithOAuth;

    try {
      if (url.pathname === '/health') return handleHealth(env);

      if (url.pathname === '/authorize') {
        if (request.method === 'GET') return await handleAuthorizeGet(request, typedEnv);
        if (request.method === 'POST') return await handleAuthorizePost(request, typedEnv);
        return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
      }

      if (url.pathname === '/callback') {
        if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
        return await handleCallback(request, typedEnv);
      }

      if (url.pathname === '/') {
        return htmlPage(
          'AI Planner MCP',
          `<h1>AI Planner MCP</h1>
           <p>Remote Model Context Protocol server for the AI Planner study app.</p>
           <p>Add <code>${escapeHtml(new URL('/mcp', request.url).toString())}</code> as a custom connector in Claude.ai.</p>
           <p class="note">The MCP endpoint requires OAuth and is limited to a single GitHub account.</p>`,
        );
      }
    } catch {
      return errorPage('Something went wrong', 'The authorization server hit an unexpected error.', 500);
    }

    return new Response('Not found', { status: 404 });
  },
};
