import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workersStub = fileURLToPath(new URL('./test/stubs/cloudflare-workers.ts', import.meta.url));

/**
 * `@cloudflare/workers-oauth-provider` imports `cloudflare:workers` at runtime. The tests
 * run on Node, so redirect that specifier to a tiny stub — nothing under test uses it.
 */
const cloudflareWorkersStub = {
  name: 'stub-cloudflare-workers',
  enforce: 'pre' as const,
  resolveId(source: string) {
    return source === 'cloudflare:workers' ? workersStub : null;
  },
};

export default defineConfig({
  plugins: [cloudflareWorkersStub],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    server: {
      // Must be processed by Vite (not Node's ESM loader) for the stub above to apply.
      deps: { inline: ['@cloudflare/workers-oauth-provider'] },
    },
  },
});
