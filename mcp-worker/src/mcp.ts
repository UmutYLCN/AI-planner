/**
 * The authenticated MCP endpoint.
 *
 * Streamable HTTP (the current MCP transport), stateless: one MCP server and one
 * transport per request — no sessions, no Durable Objects, no deprecated SSE endpoint
 * and no McpAgent.
 *
 * Kept out of `index.ts` on purpose: a Worker's main module may only export `default`
 * plus entrypoint classes, so every other named export lives here.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { createMcpServer } from './tools.js';
import type { AuthProps, AuthedExecutionContext, Env } from './types.js';

export const MCP_ROUTE = '/mcp';

/** JSON-RPC shaped 401 so an MCP client reports something useful instead of parse noise. */
function unauthorized(): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: 'Unauthorized: this MCP server requires an authorized GitHub account.' },
    },
    { status: 401, headers: { 'www-authenticate': 'Bearer', 'cache-control': 'no-store' } },
  );
}

/** Narrows the opaque `ctx.props` the OAuth provider decrypts out of the access token. */
function readAuthProps(props: unknown): AuthProps | null {
  if (!props || typeof props !== 'object') return null;
  const candidate = props as Partial<AuthProps>;
  if (typeof candidate.githubUserId !== 'string' || candidate.githubUserId.length === 0) return null;
  return {
    githubUserId: candidate.githubUserId,
    githubLogin: typeof candidate.githubLogin === 'string' ? candidate.githubLogin : '',
  };
}

/**
 * Handles authenticated /mcp traffic. The OAuth provider only routes here after it has
 * validated a bearer token, but we re-check the allow-listed GitHub id so a grant issued
 * before the allowlist changed cannot keep working.
 */
export const mcpApiHandler = {
  async fetch(request: Request, env: Env, ctx: AuthedExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname !== MCP_ROUTE) {
      return new Response('Not found', { status: 404 });
    }

    const allowed = (env.GITHUB_ALLOWED_USER_ID ?? '').trim();
    const props = readAuthProps(ctx.props);
    if (!props || !allowed || props.githubUserId !== allowed) {
      return unauthorized();
    }

    const server = createMcpServer(env);
    const transport = new WebStandardStreamableHTTPServerTransport({
      // Stateless: no session id is generated, tracked or required.
      sessionIdGenerator: undefined,
      // Plain JSON responses instead of an SSE stream — a Worker invocation should not
      // hold a stream open, and every tool here is a short request/response call.
      enableJsonResponse: true,
    });

    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
