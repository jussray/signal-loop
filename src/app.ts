import type { Env } from './lib/env.ts';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from './lib/crypto.ts';
import {
  SESSION_COOKIE, clientIp, field, formData, getCookie, html, redirect, sameOrigin, sessionCookie,
} from './lib/http.ts';
import { GitHubError, REPO_NAME, getCommit, getPublicRepo, listCommits } from './lib/github.ts';
import { CHANNELS, monthStartIso, planOf, type Channel, type Plan } from './core/plans.ts';
import { buildFiveW1H, draftFor, signalScore, type VerifiedCommit } from './core/generator.ts';
import { runFirewall } from './core/firewall.ts';
import { evaluateSignal } from './core/policy.ts';
import * as V from './views.ts';

const SESSION_DAYS = 30;
const LOGIN_WINDOW_MIN = 15;
const LOGIN_MAX_FAILURES = 8;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

interface User {
  id: string;
  email: string;
  plan: Plan;
}

const MSG: Record<string, string> = {
  repo_added: 'Repo connected. Pick a commit to draft from.',
  repo_limit: 'Repo limit reached on your plan.',
  repo_exists: 'That repo is already connected.',
  repo_invalid: 'Use the form owner/repo.',
  repo_not_found: 'GitHub could not find that repo.',
  repo_private: 'Private repos are not supported yet. Connect a public repo.',
  gh_rate: 'GitHub rate limit reached. Try again in a few minutes.',
  gh_upstream: 'GitHub is not responding. Try again shortly.',
  generated: 'Drafts created. Review them in your queue.',
  usage_limit: 'Monthly draft limit reached on your plan.',
  no_channels: 'Pick at least one channel.',
  channel_locked: 'That channel is not on your plan.',
  already: 'Drafts for that commit and channel already exist.',
  approved: 'Approved. Copy it and post it.',
  rejected: 'Rejected.',
  saved: 'Draft saved and re-checked.',
  blocked: 'Blocked drafts cannot be approved. Edit until the firewall passes.',
  rules_saved: 'Truth rules saved. New and edited drafts use them.',
  repo_deleted: 'Repo disconnected.',
  waitlist: 'You are on the Pro early-access list.',
};
const msg = (u: URL, k: string) => MSG[u.searchParams.get(k) ?? ''] ?? null;

const nowIso = () => new Date().toISOString();

async function currentUser(req: Request, env: Env): Promise<User | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.plan FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256Hex(token), nowIso()).first<{ id: string; email: string; plan: string }>();
  return row ? { id: row.id, email: row.email, plan: planOf(row.plan) } : null;
}

async function startSession(req: Request, env: Env, userId: string): Promise<string> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, expires, nowIso()).run();
  return sessionCookie(req, token, SESSION_DAYS * 86400);
}

async function usedThisMonth(env: Env, userId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM signals WHERE user_id = ? AND created_at >= ?')
    .bind(userId, monthStartIso()).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

function lines(v: string): string[] {
  return [...new Set(v.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean))].slice(0, 50);
}

// ---------- auth ----------

async function signup(req: Request, env: Env): Promise<Response> {
  const f = await formData(req);
  const email = field(f, 'email').toLowerCase();
  const password = f.get('password')?.[0] ?? '';
  if (!EMAIL.test(email)) return html(V.authPage('signup', 'Enter a valid email address.', email), 400);
  if (password.length < 10 || password.length > 200) {
    return html(V.authPage('signup', 'Password must be at least 10 characters.', email), 400);
  }
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (exists) return html(V.authPage('signup', 'An account with that email already exists. Log in instead.', email), 409);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, email, password_hash, plan, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, await hashPassword(password), 'free', nowIso()).run();
  return redirect('/app?ok=welcome', { 'Set-Cookie': await startSession(req, env, id) });
}

async function login(req: Request, env: Env): Promise<Response> {
  const f = await formData(req);
  const email = field(f, 'email').toLowerCase();
  const password = f.get('password')?.[0] ?? '';
  const key = await sha256Hex(`${email}|${clientIp(req)}`);
  const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 6e4).toISOString();
  const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE key = ? AND at > ?')
    .bind(key, since).first<{ n: number }>();
  if (Number(fails?.n ?? 0) >= LOGIN_MAX_FAILURES) return html(V.tooMany(), 429);

  const user = await env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .bind(email).first<{ id: string; password_hash: string }>();
  // Always run a hash so response time does not reveal whether the email exists.
  const ok = user
    ? await verifyPassword(password, user.password_hash)
    : (await verifyPassword(password, 'pbkdf2$100000$00000000000000000000000000000000$' + '0'.repeat(64)), false);
  if (!user || !ok) {
    await env.DB.prepare('INSERT INTO login_failures (key, at) VALUES (?, ?)').bind(key, nowIso()).run();
    return html(V.authPage('login', 'Email or password is incorrect.', email), 401);
  }
  await env.DB.prepare('DELETE FROM login_failures WHERE key = ?').bind(key).run();
  return redirect('/app', { 'Set-Cookie': await startSession(req, env, user.id) });
}

async function logout(req: Request, env: Env): Promise<Response> {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return redirect('/', { 'Set-Cookie': sessionCookie(req, '', 0) });
}

// ---------- app ----------

async function dashboard(url: URL, env: Env, user: User): Promise<Response> {
  const status = ['draft', 'approved', 'rejected', 'all'].includes(url.searchParams.get('status') ?? '')
    ? url.searchParams.get('status')!
    : 'draft';
  const repos = (await env.DB.prepare('SELECT id, full_name, never_claim, never_expose FROM repos WHERE user_id = ? ORDER BY created_at')
    .bind(user.id).all<V.RepoRow>()).results;
  const signals = (await env.DB.prepare(
    `SELECT s.id, r.full_name AS repo_full_name, s.commit_sha, s.commit_url, s.channel, s.draft, s.decision, s.reasons, s.status, s.created_at
     FROM signals s JOIN repos r ON r.id = s.repo_id WHERE s.user_id = ? ${status === 'all' ? '' : 'AND s.status = ?'}
     ORDER BY s.created_at DESC LIMIT 100`,
  ).bind(...(status === 'all' ? [user.id] : [user.id, status])).all<V.SignalRow>()).results;
  const wl = await env.DB.prepare('SELECT 1 FROM waitlist WHERE user_id = ?').bind(user.id).first();
  const ok = url.searchParams.get('ok') === 'welcome' ? 'Account created. Connect a public repo to start.' : msg(url, 'ok');
  return html(V.dashboard({
    user, repos, signals, usedThisMonth: await usedThisMonth(env, user.id), onWaitlist: !!wl, filter: status, ok, err: msg(url, 'err'),
  }));
}

async function addRepo(req: Request, env: Env, user: User): Promise<Response> {
  const fullName = field(await formData(req), 'full_name').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '');
  if (!REPO_NAME.test(fullName)) return redirect('/app?err=repo_invalid');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM repos WHERE user_id = ?').bind(user.id).first<{ n: number }>();
  if (Number(count?.n ?? 0) >= user.plan.maxRepos) return redirect('/app?err=repo_limit');
  let canonical: string;
  try {
    canonical = (await getPublicRepo(env, fullName)).fullName;
  } catch (e) {
    return redirect(`/app?err=${ghErr(e)}`);
  }
  const dup = await env.DB.prepare('SELECT 1 FROM repos WHERE user_id = ? AND lower(full_name) = lower(?)').bind(user.id, canonical).first();
  if (dup) return redirect('/app?err=repo_exists');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO repos (id, user_id, full_name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, user.id, canonical, nowIso()).run();
  return redirect(`/app/repos/${id}?ok=repo_added`);
}

function ghErr(e: unknown): string {
  if (e instanceof GitHubError) {
    return { not_found: 'repo_not_found', private: 'repo_private', rate_limited: 'gh_rate', upstream: 'gh_upstream' }[e.code];
  }
  return 'gh_upstream';
}

async function ownedRepo(env: Env, user: User, id: string): Promise<V.RepoRow | null> {
  return env.DB.prepare('SELECT id, full_name, never_claim, never_expose FROM repos WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first<V.RepoRow>();
}

async function repoPage(url: URL, env: Env, user: User, repo: V.RepoRow): Promise<Response> {
  let commits: VerifiedCommit[] = [];
  let githubError: string | null = null;
  try {
    commits = await listCommits(env, repo.full_name);
  } catch (e) {
    githubError = MSG[ghErr(e)] ?? 'GitHub error';
  }
  return html(V.repoPage({
    user, repo, githubError, showAll: url.searchParams.get('all') === '1',
    commits: commits.map((c) => ({ ...c, score: signalScore(c.message) })),
    ok: msg(url, 'ok'), err: msg(url, 'err'),
  }));
}

function rulesOf(repo: V.RepoRow) {
  return { neverClaim: JSON.parse(repo.never_claim || '[]'), neverExpose: JSON.parse(repo.never_expose || '[]') };
}

async function connectedRepos(env: Env, user: User): Promise<string[]> {
  return (await env.DB.prepare('SELECT full_name FROM repos WHERE user_id = ?').bind(user.id).all<{ full_name: string }>())
    .results.map((r) => r.full_name);
}

async function generate(req: Request, env: Env, user: User, repo: V.RepoRow): Promise<Response> {
  const f = await formData(req);
  const sha = field(f, 'sha');
  const channels = [...new Set(f.get('channels') ?? [])] as Channel[];
  const back = `/app/repos/${repo.id}`;
  if (channels.length === 0) return redirect(`${back}?err=no_channels`);
  if (channels.some((c) => !(CHANNELS as readonly string[]).includes(c) || !user.plan.channels.includes(c))) {
    return redirect(`${back}?err=channel_locked`);
  }
  const used = await usedThisMonth(env, user.id);
  if (used + channels.length > user.plan.signalsPerMonth) return redirect(`${back}?err=usage_limit`);

  let commit: VerifiedCommit;
  try {
    commit = await getCommit(env, repo.full_name, sha); // server-side evidence read
  } catch (e) {
    return redirect(`${back}?err=${ghErr(e)}`);
  }
  const fiveW1h = buildFiveW1H(commit);
  const connected = await connectedRepos(env, user);
  let created = 0;
  for (const channel of channels) {
    const draft = draftFor(channel, commit, fiveW1h);
    const violations = runFirewall(draft, channel, rulesOf(repo));
    const result = evaluateSignal(
      {
        repository: repo.full_name, channel, proofUrl: commit.url, sourceCommitSha: commit.sha, fiveW1h,
        evidenceReceipt: { verified: true, provider: 'github', repository: repo.full_name, sourceCommitSha: commit.sha, proofUrl: commit.url },
      },
      { connectedRepositories: connected, grant: null, firewallViolations: violations },
    );
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO signals (id, user_id, repo_id, commit_sha, commit_url, channel, draft, five_w1h, decision, reasons, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    ).bind(crypto.randomUUID(), user.id, repo.id, commit.sha, commit.url, channel, draft, JSON.stringify(fiveW1h),
      result.decision, JSON.stringify(result.reasons), nowIso(), nowIso()).run();
    created += r.meta?.changes ?? 0;
  }
  return redirect(created > 0 ? '/app?ok=generated' : `${back}?err=already`);
}

async function signalAction(req: Request, env: Env, user: User, id: string, action: string): Promise<Response> {
  const s = await env.DB.prepare(
    `SELECT s.id, s.channel, s.commit_sha, s.commit_url, s.five_w1h, s.decision, s.status, r.full_name, r.never_claim, r.never_expose, r.id AS repo_id
     FROM signals s JOIN repos r ON r.id = s.repo_id WHERE s.id = ? AND s.user_id = ?`,
  ).bind(id, user.id).first<Record<string, string>>();
  if (!s) return html(V.notFound(user), 404);
  if (s.status !== 'draft') return redirect('/app');

  if (action === 'approve') {
    if (s.decision === 'blocked') return redirect('/app?err=blocked');
    await env.DB.prepare("UPDATE signals SET status = 'approved', updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
    return redirect('/app?ok=approved');
  }
  if (action === 'reject') {
    await env.DB.prepare("UPDATE signals SET status = 'rejected', updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
    return redirect('/app?ok=rejected');
  }
  if (action === 'edit') {
    const draft = (await formData(req)).get('draft')?.[0]?.replace(/\r\n/g, '\n').trim() ?? '';
    const channel = s.channel as Channel;
    const violations = runFirewall(draft, channel, {
      neverClaim: JSON.parse(s.never_claim || '[]'), neverExpose: JSON.parse(s.never_expose || '[]'),
    });
    // Edited copy must still carry the proof link: the post stays bound to its evidence.
    if (!draft.includes(s.commit_url!)) violations.push('draft must keep the proof link to the commit');
    const result = evaluateSignal(
      {
        repository: s.full_name!, channel, proofUrl: s.commit_url!, sourceCommitSha: s.commit_sha!, fiveW1h: JSON.parse(s.five_w1h!),
        evidenceReceipt: { verified: true, provider: 'github', repository: s.full_name!, sourceCommitSha: s.commit_sha!, proofUrl: s.commit_url! },
      },
      { connectedRepositories: await connectedRepos(env, user), grant: null, firewallViolations: violations },
    );
    await env.DB.prepare('UPDATE signals SET draft = ?, decision = ?, reasons = ?, updated_at = ? WHERE id = ?')
      .bind(draft.slice(0, 5000), result.decision, JSON.stringify(result.reasons), nowIso(), id).run();
    return redirect('/app?ok=saved');
  }
  return html(V.notFound(user), 404);
}

// ---------- router ----------

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  if (path === '/style.css') return new Response(V.CSS, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  if (path === '/app.js') return new Response(V.JS, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  if (path === '/favicon.svg') return new Response(V.FAVICON, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
  if (path === '/favicon.ico') return new Response(null, { status: 204 });
  if (path === '/healthz') return Response.json({ ok: true });

  if (method === 'POST' && !sameOrigin(req)) return new Response('Cross-origin request rejected', { status: 403 });

  const user = await currentUser(req, env);

  if (path === '/' && method === 'GET') return html(V.landing(user ? { email: user.email, plan: user.plan } : null));
  if (path === '/signup') {
    if (user) return redirect('/app');
    return method === 'POST' ? signup(req, env) : html(V.authPage('signup', null));
  }
  if (path === '/login') {
    if (user) return redirect('/app');
    return method === 'POST' ? login(req, env) : html(V.authPage('login', null));
  }
  if (path === '/logout' && method === 'POST') return logout(req, env);

  if (path === '/app' || path.startsWith('/app/')) {
    if (!user) return redirect('/login');
    if (path === '/app' && method === 'GET') return dashboard(url, env, user);
    if (path === '/app/repos' && method === 'POST') return addRepo(req, env, user);
    if (path === '/app/upgrade' && method === 'POST') {
      await env.DB.prepare('INSERT OR IGNORE INTO waitlist (user_id, plan, created_at) VALUES (?, ?, ?)').bind(user.id, 'pro', nowIso()).run();
      return redirect('/app?ok=waitlist');
    }
    let m = path.match(/^\/app\/repos\/([0-9a-f-]{36})(?:\/(generate|rules|delete))?$/);
    if (m) {
      const repo = await ownedRepo(env, user, m[1]!);
      if (!repo) return html(V.notFound(user), 404);
      if (!m[2] && method === 'GET') return repoPage(url, env, user, repo);
      if (m[2] === 'generate' && method === 'POST') return generate(req, env, user, repo);
      if (m[2] === 'rules' && method === 'POST') {
        const f = await formData(req);
        await env.DB.prepare('UPDATE repos SET never_claim = ?, never_expose = ? WHERE id = ?')
          .bind(JSON.stringify(lines(f.get('never_claim')?.[0] ?? '')), JSON.stringify(lines(f.get('never_expose')?.[0] ?? '')), repo.id).run();
        return redirect(`/app/repos/${repo.id}?ok=rules_saved`);
      }
      if (m[2] === 'delete' && method === 'POST') {
        await env.DB.prepare('DELETE FROM signals WHERE repo_id = ? AND user_id = ?').bind(repo.id, user.id).run();
        await env.DB.prepare('DELETE FROM repos WHERE id = ? AND user_id = ?').bind(repo.id, user.id).run();
        return redirect('/app?ok=repo_deleted');
      }
    }
    m = path.match(/^\/app\/signals\/([0-9a-f-]{36})\/(approve|reject|edit)$/);
    if (m && method === 'POST') return signalAction(req, env, user, m[1]!, m[2]!);
  }
  return html(V.notFound(user ? { email: user.email, plan: user.plan } : null), 404);
}
