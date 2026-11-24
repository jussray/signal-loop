import { SIGNAL_DESKTOP_ART, SIGNAL_MOBILE_ART } from './brand-media.ts';
import { handle } from './app.ts';
import nativeMcp from './index.mjs';
import type { Env } from './lib/env.ts';

const nativeRoutes = new Set(['/health', '/mcp', '/mcp/registry/v0.1/servers']);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const path = new URL(req.url).pathname;
      const artwork = path === '/assets/signal-world.webp' ? SIGNAL_DESKTOP_ART :
        path === '/assets/signal-world-mobile.webp' ? SIGNAL_MOBILE_ART : null;
      if (artwork) {
        const raw = atob(artwork);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return new Response(bytes.buffer as ArrayBuffer, {
          headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
        });
      }
      if (nativeRoutes.has(path)) return nativeMcp.fetch(req);
      return await handle(req, env);
    } catch (err) {
      console.error('unhandled', err instanceof Error ? err.stack : err);
      return new Response('Something went wrong. Try again.', { status: 500 });
    }
  },
};
