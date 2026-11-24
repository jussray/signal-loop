import { SIGNAL_LOOP_VERSION } from './contract.mjs';
import { handleMcpRequest } from './mcp.mjs';
import { buildSignalLoopRegistryResponse } from './registry.mjs';

function json(value, init = {}) {
  return new Response(JSON.stringify(value, null, 2), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...(init.headers ?? {}),
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return json({
        service: 'SignalLoop',
        version: SIGNAL_LOOP_VERSION,
        authority: 'read-only-mcp',
        endpoints: {
          health: '/health',
          mcp: '/mcp',
          registry: '/mcp/registry/v0.1/servers',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'signal-loop', version: SIGNAL_LOOP_VERSION }, {
        headers: { 'cache-control': 'no-store' },
      });
    }

    if (url.pathname === '/mcp') {
      return handleMcpRequest(request);
    }

    if (request.method === 'GET' && url.pathname === '/mcp/registry/v0.1/servers') {
      const registry = buildSignalLoopRegistryResponse(url.origin, {
        search: url.searchParams.get('search') ?? undefined,
        version: url.searchParams.get('version') ?? undefined,
      });
      return json(registry, { headers: { 'cache-control': 'public, max-age=60' } });
    }

    return json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  },
};
