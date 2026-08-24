/**
 * AI Planner remote MCP server — Worker entrypoint.
 *
 * OAuth (authorize / token / dynamic client registration / discovery metadata) is handled
 * by @cloudflare/workers-oauth-provider, which persists clients, grants and tokens in
 * Workers KV. Authenticated /mcp traffic is forwarded to the stateless Streamable HTTP
 * handler in ./mcp.ts; everything else goes to the GitHub sign-in handler in ./auth.ts.
 *
 * A Worker's main module may only export `default`, so nothing else is exported here.
 */
import OAuthProvider from '@cloudflare/workers-oauth-provider';

import { authHandler } from './auth.js';
import { MCP_ROUTE, mcpApiHandler } from './mcp.js';
import type { Env } from './types.js';

export default new OAuthProvider<Env>({
  apiRoute: MCP_ROUTE,
  apiHandler: mcpApiHandler,
  defaultHandler: authHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  // Claude.ai registers itself dynamically (RFC 7591); without this the connector cannot connect.
  clientRegistrationEndpoint: '/register',
  resourceMetadata: {
    resource_name: 'AI Planner Tasks',
  },
});
