import { handle } from './app.ts';
import nativeMcp from './index.mjs';
import type { Env } from './lib/env.ts';

const nativeRoutes = new Set(['/health', '/mcp', '/mcp/registry/v0.1/servers']);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      if (nativeRoutes.has(new URL(req.url).pathname)) return nativeMcp.fetch(req);
      return await handle(req, env);
    } catch (err) {
      console.error('unhandled', err instanceof Error ? err.stack : err);
      return new Response('Something went wrong. Try again.', { status: 500 });
    }
  },
};
