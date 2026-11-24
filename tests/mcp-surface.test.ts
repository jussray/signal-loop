import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';

test('combined Worker retains native health, registry, and read-only MCP tools', async () => {
  const env = {} as Parameters<typeof worker.fetch>[1];
  const health = await worker.fetch(new Request('https://signal-loop.example/health'), env);
  assert.equal(health.status, 200);
  assert.equal((await health.json() as {ok: boolean}).ok, true);
  const registry = await worker.fetch(new Request('https://signal-loop.example/mcp/registry/v0.1/servers'), env);
  assert.equal(registry.status, 200);
  assert.equal((await registry.json() as {metadata: {count:number}}).metadata.count, 1);
  const rpc = await worker.fetch(new Request('https://signal-loop.example/mcp', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),
  }), env);
  assert.equal(rpc.status, 200);
  const body = (await rpc.json()) as {result: {tools:Array<{name:string}>}};
  assert.deepEqual(body.result.tools.map(x=>x.name), [
    'signal_loop_capabilities','signal_loop_explain_stage','signal_loop_validate_transition',
  ]);
  assert.equal(body.result.tools.some(x=>/approve|post|publish|deploy/i.test(x.name)), false);
});
