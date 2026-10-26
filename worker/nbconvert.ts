import { DurableObject } from "cloudflare:workers";

const PORT = 8080;
// Keep the container running for a while after the last conversion, so a run of downloads starts it once.
const IDLE_MS = 5 * 60 * 1000;
// Starting takes a few seconds: the VM boots, then Python loads nbconvert's templates.
const READY_TIMEOUT_MS = 60_000;

/**
 * Runs nbconvert in a Cloudflare Container (containers/nbconvert). Every conversion
 * goes to the one instance named "nbconvert"; see lib/server/nbconvert.ts.
 */
export class Nbconvert extends DurableObject<Cloudflare.Env> {
  private starting: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    const container = ctx.container;
    if (container?.running) void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(IDLE_MS));
  }

  async fetch(request: Request): Promise<Response> {
    const container = this.ctx.container;
    // No container in local development unless dev.enable_containers is on.
    if (!container) return new Response("No container is configured.", { status: 503 });
    // Concurrent requests share one start and readiness check.
    this.starting ??= this.startAndWait(container).finally(() => {
      this.starting = undefined;
    });
    await this.starting;
    const url = new URL(request.url);
    const forwarded = new Request(`http://container${url.pathname}${url.search}`, request);
    forwarded.headers.delete("host");
    return container.getTcpPort(PORT).fetch(forwarded);
  }

  private async startAndWait(container: Container): Promise<void> {
    // standard-1 is 1/2 vCPU and 4 GiB. lite (1/16 vCPU) takes about 45 s to start and convert.
    if (!container.running) container.start({ image: container.images.nbconvert, instance: "standard-1", enableInternet: false });
    await container.setInactivityTimeout(IDLE_MS);
    const port = container.getTcpPort(PORT);
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const res = await port.fetch("http://container/health", { signal: AbortSignal.timeout(2000) });
        await res.body?.cancel();
        if (res.ok) return;
      } catch (err) {
        lastError = err;
      }
      await scheduler.wait(250);
    }
    throw new Error("The nbconvert container didn't become ready.", { cause: lastError });
  }
}
