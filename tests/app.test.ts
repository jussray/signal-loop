import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.ts';
import { createD1 } from '../dev/d1-sqlite.ts';
import { hashPassword, verifyPassword } from '../src/lib/crypto.ts';
import { githubFixture } from './fixtures.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://app.test';
const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = new URL(String(input instanceof Request ? input.url : input));
    if (u.host !== 'gh.test') return realFetch(input as any);
    const [status, body] = githubFixture(u.pathname + u.search);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
});

function makeEnv() {
  return { DB: createD1(':memory:', join(root, 'migrations')), GITHUB_API_BASE: 'http://gh.test' };
}

class Client {
  cookie = '';
  env: ReturnType<typeof makeEnv>;
  constructor(env: ReturnType<typeof makeEnv>) {
    this.env = env;
  }
  async req(method: string, path: string, form?: Record<string, string | string[]>) {
    const headers = new Headers({ Origin: BASE });
    if (this.cookie) headers.set('Cookie', this.cookie);
    let body: string | undefined;
    if (form) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(form)) (Array.isArray(v) ? v : [v]).forEach((x) => p.append(k, x));
      body = p.toString();
      headers.set('Content-Type', 'application/x-www-form-urlencoded');
    }
    const res = await worker.fetch(new Request(BASE + path, { method, headers, body }), this.env);
    const sc = res.headers.get('Set-Cookie');
    if (sc) this.cookie = sc.split(';')[0]!;
    return { res, text: await res.text() };
  }
}

test('crypto: hash round-trip and wrong password', async () => {
  const h = await hashPassword('correct horse battery');
  assert.match(h, /^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(await verifyPassword('correct horse battery', h), true);
  assert.equal(await verifyPassword('wrong horse battery', h), false);
});

test('auth: signup, session, logout, login, bad password, duplicate', async () => {
  const c = new Client(makeEnv());
  assert.equal((await c.req('GET', '/app')).res.headers.get('Location'), '/login');
  const s = await c.req('POST', '/signup', { email: 'Founder@Example.com', password: 'longenough1' });
  assert.equal(s.res.status, 303);
  assert.match(s.res.headers.get('Set-Cookie')!, /HttpOnly; SameSite=Lax/);
  const d = await c.req('GET', '/app');
  assert.equal(d.res.status, 200);
  assert.match(d.text, /founder@example\.com/);
  await c.req('POST', '/logout');
  assert.equal((await c.req('GET', '/app')).res.status, 303);
  assert.equal((await c.req('POST', '/login', { email: 'founder@example.com', password: 'nope-nope-nope' })).res.status, 401);
  assert.equal((await c.req('POST', '/login', { email: 'founder@example.com', password: 'longenough1' })).res.status, 303);
  assert.equal((await c.req('GET', '/app')).res.status, 200);
  const dup = new Client(c.env);
  assert.equal((await dup.req('POST', '/signup', { email: 'founder@example.com', password: 'longenough1' })).res.status, 409);
  assert.equal((await dup.req('POST', '/signup', { email: 'x@y.co', password: 'short' })).res.status, 400);
});

test('auth: login rate limit after repeated failures', async () => {
  const env = makeEnv();
  const c = new Client(env);
  await c.req('POST', '/signup', { email: 'rl@example.com', password: 'longenough1' });
  const anon = new Client(env);
  for (let i = 0; i < 8; i++) await anon.req('POST', '/login', { email: 'rl@example.com', password: 'wrong-password' });
  assert.equal((await anon.req('POST', '/login', { email: 'rl@example.com', password: 'longenough1' })).res.status, 429);
});

test('security: cross-origin POST rejected; headers present', async () => {
  const env = makeEnv();
  const res = await worker.fetch(new Request(BASE + '/signup', {
    method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'email=a%40b.co&password=longenough1',
  }), env);
  assert.equal(res.status, 403);
  const home = await worker.fetch(new Request(BASE + '/'), env);
  assert.match(home.headers.get('Content-Security-Policy')!, /frame-ancestors 'none'/);
});

test('freemium loop: connect repo, limits, generate, firewall, approve, isolation', async () => {
  const env = makeEnv();
  const c = new Client(env);
  await c.req('POST', '/signup', { email: 'f@example.com', password: 'longenough1' });

  assert.match((await c.req('POST', '/app/repos', { full_name: 'acme/private-thing' })).res.headers.get('Location')!, /repo_private/);
  assert.match((await c.req('POST', '/app/repos', { full_name: 'not a repo' })).res.headers.get('Location')!, /repo_invalid/);
  const add = await c.req('POST', '/app/repos', { full_name: 'https://github.com/acme/rocket' });
  const repoPath = add.res.headers.get('Location')!.split('?')[0]!;
  assert.match(repoPath, /^\/app\/repos\/[0-9a-f-]{36}$/);
  assert.match((await c.req('POST', '/app/repos', { full_name: 'acme/second' })).res.headers.get('Location')!, /repo_limit/);

  const page = await c.req('GET', repoPath);
  assert.match(page.text, /add magic-link login/);
  assert.doesNotMatch(page.text, /Merge pull request/); // low-signal hidden by default

  assert.match((await c.req('POST', `${repoPath}/generate`, { sha: 'a'.repeat(40), channels: ['threads'] })).res.headers.get('Location')!, /channel_locked/);
  const gen = await c.req('POST', `${repoPath}/generate`, { sha: 'a'.repeat(40), channels: ['x', 'linkedin'] });
  assert.equal(gen.res.headers.get('Location'), '/app?ok=generated');
  assert.match((await c.req('POST', `${repoPath}/generate`, { sha: 'a'.repeat(40), channels: ['x'] })).res.headers.get('Location')!, /already/);

  // Secret in commit message -> blocked, cannot be approved.
  await c.req('POST', `${repoPath}/generate`, { sha: 'f'.repeat(40), channels: ['x'] });
  // Overclaim -> blocked.
  await c.req('POST', `${repoPath}/generate`, { sha: 'e'.repeat(40), channels: ['x'] });

  const rows = (await env.DB.prepare('SELECT id, commit_sha, channel, decision, reasons, draft, commit_url FROM signals').all<any>()).results;
  assert.equal(rows.length, 4);
  const clean = rows.find((r) => r.commit_sha === 'a'.repeat(40) && r.channel === 'x');
  const secret = rows.find((r) => r.commit_sha === 'f'.repeat(40));
  const over = rows.find((r) => r.commit_sha === 'e'.repeat(40));
  assert.equal(clean.decision, 'review');
  assert.equal(secret.decision, 'blocked');
  assert.match(secret.reasons, /GitHub token/);
  assert.equal(over.decision, 'blocked');
  assert.match(over.reasons, /unprovable claim/);

  assert.match((await c.req('POST', `/app/signals/${secret.id}/approve`)).res.headers.get('Location')!, /err=blocked/);

  // Fix the overclaim by editing -> re-checked -> review -> approvable.
  const fixed = over.draft.replace(/production-ready /i, '');
  await c.req('POST', `/app/signals/${over.id}/edit`, { draft: fixed });
  const after = await env.DB.prepare('SELECT decision FROM signals WHERE id = ?').bind(over.id).first<any>();
  assert.equal(after.decision, 'review');
  // Removing the proof link is blocked.
  await c.req('POST', `/app/signals/${over.id}/edit`, { draft: 'Shipped a billing dashboard today, very happy with it.' });
  assert.equal((await env.DB.prepare('SELECT decision FROM signals WHERE id = ?').bind(over.id).first<any>()).decision, 'blocked');

  assert.equal((await c.req('POST', `/app/signals/${clean.id}/approve`)).res.headers.get('Location'), '/app?ok=approved');
  assert.equal((await env.DB.prepare('SELECT status FROM signals WHERE id = ?').bind(clean.id).first<any>()).status, 'approved');

  // Tenant isolation: another user cannot see or act on these.
  const other = new Client(env);
  await other.req('POST', '/signup', { email: 'other@example.com', password: 'longenough1' });
  assert.equal((await other.req('GET', repoPath)).res.status, 404);
  assert.equal((await other.req('POST', `/app/signals/${clean.id}/reject`)).res.status, 404);

  // Usage meter + waitlist.
  assert.match((await c.req('GET', '/app?status=all')).text, /4 \/ 30/);
  await c.req('POST', '/app/upgrade');
  assert.match((await c.req('GET', '/app')).text, /You are on the list/);
});

test('freemium: monthly draft limit enforced server-side', async () => {
  const env = makeEnv();
  const c = new Client(env);
  await c.req('POST', '/signup', { email: 'lim@example.com', password: 'longenough1' });
  const repoPath = (await c.req('POST', '/app/repos', { full_name: 'acme/rocket' })).res.headers.get('Location')!.split('?')[0]!;
  const u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind('lim@example.com').first<any>();
  const repo = await env.DB.prepare('SELECT id FROM repos WHERE user_id = ?').bind(u.id).first<any>();
  const now = new Date().toISOString();
  for (let i = 0; i < 29; i++) {
    await env.DB.prepare(`INSERT INTO signals (id, user_id, repo_id, commit_sha, commit_url, channel, draft, five_w1h, decision, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'u', 'x', 'd', '{}', 'review', ?, ?)`).bind(crypto.randomUUID(), u.id, repo.id, String(i).padStart(40, '0'), now, now).run();
  }
  assert.match((await c.req('POST', `${repoPath}/generate`, { sha: 'b'.repeat(40), channels: ['x', 'linkedin'] })).res.headers.get('Location')!, /usage_limit/);
  assert.equal((await c.req('POST', `${repoPath}/generate`, { sha: 'b'.repeat(40), channels: ['x'] })).res.headers.get('Location'), '/app?ok=generated');
});
