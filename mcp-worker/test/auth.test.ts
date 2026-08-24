import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authHandler, fetchGitHubUser, isAllowedGitHubUser, signState, verifyState } from '../src/auth.js';
import type { Env } from '../src/types.js';

const COOKIE_KEY = 'test-cookie-encryption-key-0123456789abcdef';
const ALLOWED_GITHUB_ID = '4242424242';
const CLIENT_SECRET = 'gho_super_secret_client_secret';

const authRequest = {
  responseType: 'code',
  clientId: 'client-abc',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  scope: [],
  state: 'client-state',
  codeChallenge: 'challenge',
  codeChallengeMethod: 'S256',
};

let completeAuthorization: ReturnType<typeof vi.fn>;

function makeEnv(overrides: Partial<Env> = {}): Env {
  completeAuthorization = vi.fn(async () => ({ redirectTo: 'https://claude.ai/done?code=abc' }));
  return {
    OAUTH_KV: {} as KVNamespace,
    GITHUB_CLIENT_ID: 'Iv1.testclientid',
    GITHUB_CLIENT_SECRET: CLIENT_SECRET,
    GITHUB_ALLOWED_USER_ID: ALLOWED_GITHUB_ID,
    COOKIE_ENCRYPTION_KEY: COOKIE_KEY,
    FIREBASE_PROJECT_ID: 'ai-planner-test',
    FIREBASE_CLIENT_EMAIL: 'planner@ai-planner-test.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: 'pem',
    FIREBASE_OWNER_UID: 'ownerUid123',
    OAUTH_PROVIDER: {
      parseAuthRequest: vi.fn(async () => authRequest),
      lookupClient: vi.fn(async () => ({ clientId: 'client-abc', clientName: 'Claude', redirectUris: [] })),
      completeAuthorization,
    },
    ...overrides,
  } as unknown as Env;
}

/** Drives the flow up to /callback and returns the response. */
async function runCallback(
  env: Env,
  options: { githubUser?: { id: number; login: string }; tamperState?: (state: string) => string; omitCookie?: boolean } = {},
) {
  const state = await signState({ authRequest: authRequest as never, nonce: 'nonce-123', issuedAt: Date.now() }, COOKIE_KEY);
  const finalState = options.tamperState ? options.tamperState(state) : state;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('login/oauth/access_token')) {
        return Response.json({ access_token: 'gho_user_access_token' });
      }
      if (url.includes('api.github.com/user')) {
        return Response.json(options.githubUser ?? { id: Number(ALLOWED_GITHUB_ID), login: 'planner-owner' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );

  const headers: Record<string, string> = {};
  if (!options.omitCookie) headers.cookie = `ai_planner_oauth_nonce=nonce-123`;

  return authHandler.fetch(
    new Request(`https://mcp.example.workers.dev/callback?code=gh-code&state=${encodeURIComponent(finalState)}`, {
      headers,
    }),
    env,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('signed OAuth state', () => {
  it('round-trips a valid state', async () => {
    const state = await signState({ authRequest: authRequest as never, nonce: 'n', issuedAt: Date.now() }, COOKIE_KEY);
    const payload = await verifyState(state, COOKIE_KEY);
    expect(payload?.authRequest.clientId).toBe('client-abc');
  });

  it('rejects a tampered payload', async () => {
    const state = await signState({ authRequest: authRequest as never, nonce: 'n', issuedAt: Date.now() }, COOKIE_KEY);
    const [body, signature] = state.split('.');
    const forged = btoa(JSON.stringify({ authRequest: { ...authRequest, redirectUri: 'https://evil.example' }, nonce: 'n', issuedAt: Date.now() }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(body).not.toBe(forged);
    expect(await verifyState(`${forged}.${signature}`, COOKIE_KEY)).toBeNull();
  });

  it('rejects a state signed with a different key', async () => {
    const state = await signState({ authRequest: authRequest as never, nonce: 'n', issuedAt: Date.now() }, COOKIE_KEY);
    expect(await verifyState(state, 'another-key-that-is-long-enough-here')).toBeNull();
  });

  it('rejects an expired state', async () => {
    const state = await signState(
      { authRequest: authRequest as never, nonce: 'n', issuedAt: Date.now() - 20 * 60 * 1000 },
      COOKIE_KEY,
    );
    expect(await verifyState(state, COOKIE_KEY)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifyState('not-a-state', COOKIE_KEY)).toBeNull();
    expect(await verifyState('', COOKIE_KEY)).toBeNull();
  });
});

describe('isAllowedGitHubUser', () => {
  it('accepts only the exact numeric id', () => {
    expect(isAllowedGitHubUser(ALLOWED_GITHUB_ID, ALLOWED_GITHUB_ID)).toBe(true);
    expect(isAllowedGitHubUser('424242424', ALLOWED_GITHUB_ID)).toBe(false);
    expect(isAllowedGitHubUser('42424242420', ALLOWED_GITHUB_ID)).toBe(false);
  });

  it('fails closed when the allowlist is unset or not numeric', () => {
    expect(isAllowedGitHubUser(ALLOWED_GITHUB_ID, undefined)).toBe(false);
    expect(isAllowedGitHubUser(ALLOWED_GITHUB_ID, '')).toBe(false);
    // A username must never be accepted in place of the immutable numeric id.
    expect(isAllowedGitHubUser('planner-owner', 'planner-owner')).toBe(false);
  });
});

describe('/callback', () => {
  it('grants access to the allowed GitHub account', async () => {
    const env = makeEnv();
    const response = await runCallback(env);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://claude.ai/done?code=abc');
    expect(completeAuthorization).toHaveBeenCalledTimes(1);
    const args = completeAuthorization.mock.calls[0]![0];
    expect(args.userId).toBe(ALLOWED_GITHUB_ID);
    expect(args.props).toEqual({ githubUserId: ALLOWED_GITHUB_ID, githubLogin: 'planner-owner' });
    // The GitHub access token must not be persisted with the grant.
    expect(JSON.stringify(args.props)).not.toContain('gho_user_access_token');
  });

  it('rejects a different GitHub account without revealing the allowed id', async () => {
    const env = makeEnv();
    const response = await runCallback(env, { githubUser: { id: 999, login: 'someone-else' } });

    expect(response.status).toBe(403);
    expect(completeAuthorization).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain(ALLOWED_GITHUB_ID);
    expect(body).not.toContain(CLIENT_SECRET);
    expect(body).not.toContain('gho_user_access_token');
  });

  it('rejects a GitHub id supplied as a string, not a number', async () => {
    const env = makeEnv();
    // A spoofed payload where `id` is the *username* must not pass the numeric check.
    const response = await runCallback(env, { githubUser: { id: ALLOWED_GITHUB_ID as never, login: 'x' } });
    expect(response.status).toBe(502);
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it('rejects a callback whose nonce cookie is missing (CSRF)', async () => {
    const env = makeEnv();
    const response = await runCallback(env, { omitCookie: true });
    expect(response.status).toBe(400);
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it('rejects a state that was not signed by this Worker', async () => {
    const env = makeEnv();
    const response = await runCallback(env, { tamperState: (state) => `${state}x` });
    expect(response.status).toBe(400);
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it('rejects a callback with no code', async () => {
    const env = makeEnv();
    const response = await authHandler.fetch(
      new Request('https://mcp.example.workers.dev/callback?state=abc'),
      env,
    );
    expect(response.status).toBe(400);
  });

  it('reports a user-facing error when GitHub denies the request', async () => {
    const env = makeEnv();
    const response = await authHandler.fetch(
      new Request('https://mcp.example.workers.dev/callback?error=access_denied&state=abc'),
      env,
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(CLIENT_SECRET);
  });
});

describe('/authorize', () => {
  it('shows an approval screen naming the client', async () => {
    const env = makeEnv();
    const response = await authHandler.fetch(
      new Request('https://mcp.example.workers.dev/authorize?client_id=client-abc'),
      env,
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('Claude');
    expect(body).toContain('https://claude.ai/api/mcp/auth_callback');
    expect(body).not.toContain(CLIENT_SECRET);
    expect(body).not.toContain(ALLOWED_GITHUB_ID);
  });

  it('refuses an unregistered client', async () => {
    const env = makeEnv();
    (env as never as { OAUTH_PROVIDER: { lookupClient: ReturnType<typeof vi.fn> } }).OAUTH_PROVIDER.lookupClient =
      vi.fn(async () => null);

    const response = await authHandler.fetch(
      new Request('https://mcp.example.workers.dev/authorize?client_id=unknown'),
      env,
    );
    expect(response.status).toBe(400);
  });

  it('redirects to GitHub and sets a nonce cookie after approval', async () => {
    const env = makeEnv();
    const state = await signState({ authRequest: authRequest as never, nonce: 'nonce-xyz', issuedAt: Date.now() }, COOKIE_KEY);

    const response = await authHandler.fetch(
      new Request('https://mcp.example.workers.dev/authorize', {
        method: 'POST',
        body: new URLSearchParams({ state }),
      }),
      env,
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('redirect_uri')).toBe('https://mcp.example.workers.dev/callback');
    expect(location.searchParams.get('client_id')).toBe('Iv1.testclientid');
    // The client secret must never reach the browser.
    expect(response.headers.get('location')).not.toContain(CLIENT_SECRET);

    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('ai_planner_oauth_nonce=nonce-xyz');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('rejects an approval POST with a forged state', async () => {
    const env = makeEnv();
    const response = await authHandler.fetch(
      new Request('https://mcp.example.workers.dev/authorize', {
        method: 'POST',
        body: new URLSearchParams({ state: 'forged.state' }),
      }),
      env,
    );
    expect(response.status).toBe(400);
  });
});

describe('/health', () => {
  it('reports only whether secrets are present', async () => {
    const env = makeEnv();
    const response = await authHandler.fetch(new Request('https://mcp.example.workers.dev/health'), env);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ status: 'ok', transport: 'streamable-http' });
    for (const secret of [CLIENT_SECRET, ALLOWED_GITHUB_ID, COOKIE_KEY, 'ownerUid123', 'Iv1.testclientid']) {
      expect(body, secret).not.toContain(secret);
    }
  });
});

describe('fetchGitHubUser', () => {
  it('rejects a token response that carries no access token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bad_verification_code' })));

    await expect(
      fetchGitHubUser('code', 'https://mcp.example.workers.dev/callback', {
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: CLIENT_SECRET,
      }),
    ).rejects.toThrowError(/did not return an access token/);
  });

  it('does not put the client secret into thrown errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    await expect(
      fetchGitHubUser('code', 'https://mcp.example.workers.dev/callback', {
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: CLIENT_SECRET,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ message: expect.not.stringContaining(CLIENT_SECRET) as unknown as string }),
    );
  });
});

describe('unknown routes', () => {
  it('404s anything that is not an OAuth or info route', async () => {
    const env = makeEnv();
    const response = await authHandler.fetch(new Request('https://mcp.example.workers.dev/admin'), env);
    expect(response.status).toBe(404);
  });
});
