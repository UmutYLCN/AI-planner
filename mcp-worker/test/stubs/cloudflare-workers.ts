/** Node stand-in for the `cloudflare:workers` module, used only by the test runner. */
export class WorkerEntrypoint {
  readonly ctx: unknown;
  readonly env: unknown;

  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}
