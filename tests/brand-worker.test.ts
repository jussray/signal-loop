import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';

test('desktop and mobile art are public binary WebP and require no session', async () => {
  for (const path of ['/assets/signal-world.webp', '/assets/signal-world-mobile.webp']) {
    const response = await worker.fetch(new Request(`https://signal-loop.example${path}`), {} as never);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'image/webp');
    assert.match(response.headers.get('Cache-Control') ?? '', /public/);
    const image = new Uint8Array(await response.arrayBuffer());
    assert.equal(new TextDecoder().decode(image.slice(0, 4)), 'RIFF');
    assert.ok(image.byteLength > 12_000);
  }
});

test('unknown asset path cannot access a private resource', async () => {
  const response = await worker.fetch(new Request('https://signal-loop.example/assets/../private'), {} as never);
  assert.notEqual(response.status, 200);
});