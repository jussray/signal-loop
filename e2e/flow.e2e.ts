/**
 * Real-browser proof of the full user-facing flow.
 * Boots: mock GitHub API (fixtures) + the real app server (dev/server.ts), then drives Chromium.
 *   npm run e2e          (uses `playwright` from node_modules)
 *   PLAYWRIGHT_MODULE=/abs/path/to/playwright npm run e2e
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { githubFixture } from '../tests/fixtures.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'e2e', 'artifacts');
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const GH_PORT = 9911;
const APP_PORT = 8799;
const APP = `http://localhost:${APP_PORT}`;

const gh = createServer((req, res) => {
  const [status, body] = githubFixture(req.url || '/');
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}).listen(GH_PORT);

const app = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', join(root, 'dev/server.ts')], {
  env: { ...process.env, PORT: String(APP_PORT), GITHUB_API_BASE: `http://localhost:${GH_PORT}`, DB_FILE: ':memory:' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
app.on('exit', (code) => { if (code) { console.error(`app exited ${code}`); gh.close(); process.exit(1); } });
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => { app.kill(); gh.close(); reject(new Error('app did not start')); }, 15000);
  app.stdout!.on('data', (d: Buffer) => { if (String(d).includes('signal-loop dev on')) { clearTimeout(t); resolve(); } });
});

const steps: string[] = [];
const step = (s: string) => { steps.push(s); console.log(`✓ ${s}`); };
let failed = false;
let browser: any;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m: any) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(APP + '/');
  assert.match(await page.locator('h1').innerText(), /Your commits are the story/);
  assert.equal(await page.locator('[data-plan]').count(), 2);
  assert.match(await page.locator('[data-plan="pro"]').innerText(), /Early access/);
  await page.screenshot({ path: join(out, '01-landing.png'), fullPage: true });
  step('landing renders hero + 2 pricing tiers (Pro shows no invented price)');

  await page.click('text=Start free, no card');
  await page.waitForURL(APP + '/signup');
  await page.fill('#email', 'founder@example.com');
  await page.fill('#password', 'short');
  await page.click('button[type=submit]');
  assert.match(await page.locator('.flash.err').innerText(), /at least 10/);
  step('signup rejects weak password with visible error');

  await page.fill('#password', 'a-strong-passphrase');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/app\?ok=welcome/);
  assert.equal(await page.getByTestId('usage').innerText(), '0 / 30');
  const cookies = await ctx.cookies();
  const sess = cookies.find((c: any) => c.name === 'sl_session');
  assert.ok(sess?.httpOnly, 'session cookie is HttpOnly');
  assert.equal(sess.sameSite, 'Lax');
  await page.screenshot({ path: join(out, '02-dashboard-empty.png'), fullPage: true });
  step('signup → dashboard, usage 0/30, HttpOnly SameSite=Lax session');

  await page.fill('#repo', 'acme/private-thing');
  await page.click('form[action="/app/repos"] button');
  assert.match(await page.locator('.flash.err').innerText(), /Private repos/);
  await page.fill('#repo', 'acme/rocket');
  await page.click('form[action="/app/repos"] button');
  await page.waitForURL(/\/app\/repos\/.+\?ok=repo_added/);
  const repoUrl = page.url().split('?')[0];
  assert.ok(await page.locator('text=add magic-link login').isVisible());
  assert.equal(await page.locator('text=Merge pull request').count(), 0);
  assert.match(await page.locator('text=low-signal commit').innerText(), /2 low-signal commits hidden/);
  await page.screenshot({ path: join(out, '03-repo-commits.png'), fullPage: true });
  step('private repo refused; public repo connected; noise commits hidden');

  await page.locator(`tr[data-sha="${'a'.repeat(40)}"] button`).click();
  await page.waitForURL(APP + '/app?ok=generated');
  assert.equal(await page.locator('article.signal.review').count(), 2);
  assert.equal(await page.getByTestId('usage').innerText(), '2 / 30');
  step('verified commit → 2 drafts (X + LinkedIn) in review, usage 2/30');

  await page.goto(repoUrl);
  await page.locator(`tr[data-sha="${'f'.repeat(40)}"] button`).click();
  await page.waitForURL(APP + '/app?ok=generated');
  const blocked = page.locator('article.signal.blocked');
  assert.equal(await blocked.count(), 2); // X + LinkedIn both carry the leaked token
  for (let i = 0; i < 2; i++) {
    assert.match(await blocked.nth(i).innerText(), /possible secret detected \(GitHub token\)/);
    assert.equal(await blocked.nth(i).locator('text=Approve').count(), 0);
  }
  await page.screenshot({ path: join(out, '04-queue-with-blocked.png'), fullPage: true });
  step('commit containing a GitHub token → both drafts BLOCKED by firewall, no Approve button');

  for (let i = 0; i < 2; i++) {
    const card = page.locator('article.signal.blocked').first();
    await card.locator('summary').click();
    const ta = card.locator('textarea');
    await ta.fill((await ta.inputValue()).replace(/ghp_[A-Za-z0-9]+/, '[redacted]'));
    await card.locator('button:has-text("Save and re-check")').click();
    await page.waitForURL(APP + '/app?ok=saved');
  }
  assert.equal(await page.locator('article.signal.blocked').count(), 0);
  assert.equal(await page.locator('article.signal.review').count(), 4);
  step('redacting the secret in the editor re-runs firewall → back to review');

  const first = page.locator('article.signal.review').first();
  await first.locator('button:has-text("Approve")').click();
  await page.waitForURL(APP + '/app?ok=approved');
  await page.goto(APP + '/app?status=approved');
  assert.equal(await page.locator('article.signal.approved').count(), 1);
  await page.screenshot({ path: join(out, '05-approved.png'), fullPage: true });
  step('approve → appears under Approved');

  await page.click('button:has-text("Log out")');
  await page.waitForURL(APP + '/');
  await page.goto(APP + '/app');
  await page.waitForURL(APP + '/login');
  await page.fill('#email', 'founder@example.com');
  await page.fill('#password', 'wrong-password-123');
  await page.click('button[type=submit]');
  assert.match(await page.locator('.flash.err').innerText(), /incorrect/);
  await page.fill('#password', 'a-strong-passphrase');
  await page.click('button[type=submit]');
  await page.waitForURL(APP + '/app');
  assert.equal(await page.getByTestId('usage').innerText(), '4 / 30');
  step('logout → /app guarded → wrong password refused → login restores state');

  await page.click('form[action="/app/upgrade"] button');
  await page.waitForURL(APP + '/app?ok=waitlist');
  assert.ok(await page.locator('text=You are on the list').isVisible());
  step('Pro early-access waitlist (no fake checkout)');

  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, storageState: await ctx.storageState() });
  const m = await mobile.newPage();
  for (const path of ['/', '/app']) {
    await m.goto(APP + path);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `no horizontal scroll at 375px on ${path} (overflow ${overflow}px)`);
  }
  await m.screenshot({ path: join(out, '06-mobile-dashboard.png'), fullPage: true });
  step('375px mobile: landing + dashboard have no horizontal scroll');

  // 400/401 are the intentional weak-password and wrong-password responses above.
  const unexpected = consoleErrors.filter((e) => !/status of (400|401)\b/.test(e));
  assert.deepEqual(unexpected, [], 'no unexpected browser console errors (CSP, regex, missing assets)');
  step('no unexpected console errors (only the deliberate 400/401)');
} catch (e) {
  failed = true;
  console.error('✗ E2E FAILED:', e);
} finally {
  await browser?.close();
  app.kill();
  gh.close();
}
console.log(`\n${failed ? 'FAIL' : 'PASS'}: ${steps.length} steps verified. Screenshots in e2e/artifacts/`);
process.exit(failed ? 1 : 0);
