import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.mjs';
import { handleMcpMessage } from '../src/mcp.mjs';
import { buildSignalLoopRegistryResponse } from '../src/registry.mjs';

const rpc = (id, method, params = {}) => handleMcpMessage({ jsonrpc: '2.0', id, method, params });

test('initialize advertises read-only SignalLoop server', () => {
  const response = rpc(1, 'initialize', { protocolVersion: '2025-06-18' });
  assert.equal(response.result.protocolVersion, '2025-06-18');
  assert.equal(response.result.serverInfo.name, 'signal-loop');
  assert.match(response.result.instructions, /read-only/i);
});

test('tool catalog exposes only deterministic read tools', () => {
  const response = rpc(2, 'tools/list');
  assert.deepEqual(response.result.tools.map((tool) => tool.name), [
    'signal_loop_capabilities',
    'signal_loop_explain_stage',
    'signal_loop_validate_transition',
  ]);
  assert.equal(response.result.tools.some((tool) => /publish|merge|deploy|write/i.test(tool.name)), false);
});

test('canonical transition validates and skipped transition fails', () => {
  const allowed = rpc(3, 'tools/call', {
    name: 'signal_loop_validate_transition',
    arguments: { fromStage: 'signal', toStage: 'evidence' },
  });
  assert.equal(allowed.result.structuredContent.allowed, true);

  const denied = rpc(4, 'tools/call', {
    name: 'signal_loop_validate_transition',
    arguments: { fromStage: 'signal', toStage: 'draft' },
  });
  assert.equal(denied.result.structuredContent.allowed, false);
  assert.equal(denied.result.structuredContent.expectedNext, 'evidence');
});

test('registry advertises native SignalLoop MCP at the current origin', () => {
  const response = buildSignalLoopRegistryResponse('https://signal-loop.example');
  assert.equal(response.metadata.count, 1);
  assert.equal(response.servers[0].server.repository.url, 'https://github.com/jussray/signal-loop');
  assert.equal(response.servers[0].server.remotes[0].url, 'https://signal-loop.example/mcp');
});

test('worker serves health, registry, and MCP routes', async () => {
  const health = await worker.fetch(new Request('https://signal-loop.example/health'));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  const registry = await worker.fetch(new Request('https://signal-loop.example/mcp/registry/v0.1/servers'));
  assert.equal(registry.status, 200);
  assert.equal((await registry.json()).metadata.count, 1);

  const mcp = await worker.fetch(new Request('https://signal-loop.example/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} }),
  }));
  assert.equal(mcp.status, 200);
  assert.equal((await mcp.json()).result.tools.length, 3);
});
