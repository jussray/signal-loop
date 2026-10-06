import { handle } from './app.ts';
import type { Env } from './lib/env.ts';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (err) {
      console.error('unhandled', err instanceof Error ? err.stack : err);
      return new Response('Something went wrong. Try again.', { status: 500 });
    }
  },
};
