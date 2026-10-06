import { esc } from './lib/http.ts';
import { CHANNEL_LABELS, CHANNEL_LIMITS, PLANS, type Channel, type Plan } from './core/plans.ts';

export const CSS = `
:root{--paper:#F4F1EA;--card:#FFFDF8;--ink:#16140F;--muted:#6B655A;--line:#DDD6C8;--accent:#E8572A;--accent-ink:#fff;--ok:#2F7D4F;--warn:#9A6A00;--bad:#B3261E;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--serif:ui-serif,Georgia,"Times New Roman",serif;--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#12110E;--card:#1B1A16;--ink:#EDE8DC;--muted:#A39C8E;--line:#34312A;--accent:#FF6A3D;--ok:#5FBF85;--warn:#E0B341;--bad:#FF7A6E}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--paper);color:var(--ink);font:16px/1.55 var(--sans)}
a{color:inherit}a:hover{color:var(--accent)}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
header.top{border-bottom:1px solid var(--line)}header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:64px;gap:12px}
.brand{font:700 20px var(--serif);text-decoration:none;letter-spacing:-.01em}.brand b{color:var(--accent)}
nav{display:flex;gap:14px;align-items:center}@media (max-width:560px){nav .muted{display:none}}nav a{text-decoration:none;font-size:15px}
.btn{display:inline-block;border:1px solid var(--ink);background:var(--ink);color:var(--paper);padding:10px 16px;border-radius:999px;font:600 15px var(--sans);text-decoration:none;cursor:pointer}
.btn:hover{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.ghost{background:transparent;color:var(--ink)}.btn.ghost:hover{color:var(--accent-ink)}
.btn.sm{padding:6px 12px;font-size:13px}.btn[disabled]{opacity:.45;cursor:not-allowed}
.hero{padding:72px 0 48px}.hero h1{font:600 clamp(36px,6vw,64px)/1.04 var(--serif);letter-spacing:-.02em;margin:0 0 18px;max-width:14ch}
.hero h1 em{font-style:normal;color:var(--accent)}.lede{font-size:19px;color:var(--muted);max-width:56ch;margin:0 0 28px}
.receipt{font:13px/1.6 var(--mono);background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:18px;max-width:520px}
.receipt .row{display:flex;justify-content:space-between;gap:12px}.receipt hr{border:0;border-top:1px dashed var(--line);margin:10px 0}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:40px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
.card h3{margin:0 0 8px;font:600 19px var(--serif)}
.section-title{font:600 30px var(--serif);margin:56px 0 8px;letter-spacing:-.01em}
.price{font:600 36px var(--serif)}.price small{font:14px var(--sans);color:var(--muted)}
ul.ticks{padding-left:18px;margin:10px 0 18px}ul.ticks li{margin:4px 0}
.muted{color:var(--muted)}.mono{font-family:var(--mono)}
.auth{max-width:420px;margin:64px auto}.auth h1{font:600 34px var(--serif);margin:0 0 6px}
label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}
input[type=email],input[type=password],input[type=text],textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:15px var(--sans)}
textarea{font:14px/1.5 var(--mono);min-height:120px;resize:vertical}
input:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.flash{border-radius:10px;padding:10px 14px;margin:16px 0;font-size:15px}.flash.err{background:color-mix(in srgb,var(--bad) 12%,transparent);border:1px solid var(--bad)}.flash.ok{background:color-mix(in srgb,var(--ok) 12%,transparent);border:1px solid var(--ok)}
.meter{height:8px;background:var(--line);border-radius:99px;overflow:hidden}.meter span{display:block;height:100%;background:var(--accent)}
.dash{display:grid;grid-template-columns:300px 1fr;gap:24px;margin:28px 0 64px}@media (max-width:820px){.dash{grid-template-columns:1fr}}
.stack>*+*{margin-top:16px}
.pill{display:inline-block;font:600 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:99px;border:1px solid currentColor}
.pill.review{color:var(--warn)}.pill.blocked{color:var(--bad)}.pill.approved,.pill.ready{color:var(--ok)}.pill.rejected{color:var(--muted)}
.signal{border-left:3px solid var(--accent)}.signal.blocked{border-left-color:var(--bad)}.signal.approved{border-left-color:var(--ok)}
.signal pre{white-space:pre-wrap;word-break:break-word;font:14px/1.5 var(--sans);margin:12px 0;background:transparent}
.meta{display:flex;flex-wrap:wrap;gap:8px 14px;font:12px var(--mono);color:var(--muted)}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.actions form{margin:0}
.reasons{font-size:13px;color:var(--bad);margin:8px 0 0;padding-left:18px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
.score{font:600 13px var(--mono)}.chk{display:inline-flex;gap:4px;align-items:center;margin-right:10px;font-weight:400;font-size:13px}
details summary{cursor:pointer;font-size:14px;color:var(--muted)}
footer{border-top:1px solid var(--line);padding:28px 0;color:var(--muted);font-size:14px}
`;

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#16140F"/><circle cx="16" cy="16" r="8" fill="none" stroke="#E8572A" stroke-width="3"/><circle cx="16" cy="16" r="2.5" fill="#E8572A"/></svg>`;

export const JS = `
document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;var el=document.getElementById(b.getAttribute('data-copy'));if(!el)return;navigator.clipboard.writeText(el.innerText).then(function(){var t=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=t},1200)})});
document.addEventListener('submit',function(e){var m=e.target.getAttribute('data-confirm');if(m&&!confirm(m))e.preventDefault()});
`;

export interface ViewUser {
  email: string;
  plan: Plan;
}

export function layout(title: string, body: string, user: ViewUser | null = null): string {
  const nav = user
    ? `<a href="/app">Dashboard</a><span class="muted">${esc(user.email)}</span><form method="post" action="/logout" style="margin:0"><button class="btn ghost sm" type="submit">Log out</button></form>`
    : `<a href="/#pricing">Pricing</a><a href="/login">Log in</a><a class="btn sm" href="/signup">Start free</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/style.css"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="description" content="Signal Loop turns verified commits into build-in-public posts, with a truth firewall that blocks overclaims and leaked secrets."></head><body>
<header class="top"><div class="wrap"><a class="brand" href="/">Signal<b>·</b>Loop</a><nav>${nav}</nav></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">Signal Loop · every post backed by a commit · <a href="/#how">How it works</a></div></footer>
<script src="/app.js"></script></body></html>`;
}

export function flash(kind: 'err' | 'ok', msg: string | null): string {
  return msg ? `<div class="flash ${kind}" role="${kind === 'err' ? 'alert' : 'status'}">${esc(msg)}</div>` : '';
}

function planCard(p: Plan, cta: string): string {
  const price = p.priceMonthlyUsd === 0 ? '$0' : p.priceMonthlyUsd == null ? 'Early access' : `$${p.priceMonthlyUsd}`;
  const per = p.priceMonthlyUsd != null && p.priceMonthlyUsd > 0 ? '<small> / month</small>' : '';
  return `<div class="card" data-plan="${p.id}"><h3>${esc(p.name)}</h3><div class="price">${price}${per}</div>
<ul class="ticks"><li>${p.maxRepos} connected repo${p.maxRepos > 1 ? 's' : ''}</li><li>${p.signalsPerMonth} drafts / month</li><li>${p.channels.map((c) => CHANNEL_LABELS[c]).join(', ')}</li><li>Truth firewall + review queue</li>${p.autopilot ? '<li>Autopilot posting <span class="muted">(coming)</span></li>' : ''}</ul>${cta}</div>`;
}

export function landing(user: ViewUser | null): string {
  const cta = user ? `<a class="btn" href="/app">Open dashboard</a>` : `<a class="btn" href="/signup">Start free, no card</a> <a class="btn ghost" href="#how">How it works</a>`;
  return layout(
    'Signal Loop: build in public without overclaiming',
    `<section class="hero"><h1>Your commits are the story. <em>Nothing invented.</em></h1>
<p class="lede">Signal Loop reads what you actually shipped on GitHub, drafts posts for X, LinkedIn and Bluesky, and blocks anything a commit can't prove, including leaked secrets.</p>
<p>${cta}</p>
<div class="receipt" aria-label="Example signal receipt"><div class="row"><span>SIGNAL</span><span>REVIEW</span></div><hr>
<div>Shipped in acme-app: Add magic-link login. It gives users something they could not do before.</div><hr>
<div class="row"><span>proof</span><span>github.com/acme/acme-app/commit/3f9c2e1</span></div>
<div class="row"><span>evidence</span><span>verified · sha bound</span></div><div class="row"><span>firewall</span><span>0 violations</span></div></div></section>
<h2 class="section-title" id="how">How it works</h2><p class="muted">One loop: evidence, draft, firewall, review, post.</p>
<div class="grid3"><div class="card"><h3>1 · Evidence</h3><p>Connect a public repo. We read commits server-side from GitHub, so every draft carries a verified SHA and a proof link.</p></div>
<div class="card"><h3>2 · Draft</h3><p>Each commit becomes a who/what/where/when/why/how frame, then a post sized for each channel. Noise like merges and dependency bumps is scored low.</p></div>
<div class="card"><h3>3 · Firewall</h3><p>Blocks unprovable claims ("production-ready", "SOC 2 certified"), your own never-say lists, and anything that looks like a key or token.</p></div></div>
<h2 class="section-title" id="pricing">Pricing</h2><p class="muted">Start free. Upgrade when the loop is working for you.</p>
<div class="grid3">${planCard(PLANS.free, `<a class="btn" href="${user ? '/app' : '/signup'}">${user ? 'Your plan' : 'Start free'}</a>`)}${planCard(PLANS.pro, `<a class="btn ghost" href="${user ? '/app#upgrade' : '/signup'}">Join early access</a>`)}</div>`,
    user,
  );
}

export function authPage(mode: 'signup' | 'login', error: string | null, email = ''): string {
  const isSignup = mode === 'signup';
  return layout(
    isSignup ? 'Create your account · Signal Loop' : 'Log in · Signal Loop',
    `<div class="auth"><h1>${isSignup ? 'Start free' : 'Welcome back'}</h1><p class="muted">${isSignup ? 'Free plan: 1 repo, 30 drafts a month. No card.' : 'Log in to your signal queue.'}</p>
${flash('err', error)}
<form method="post" action="/${mode}" novalidate>
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required value="${esc(email)}">
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required minlength="10">
${isSignup ? '<p class="muted" style="font-size:13px;margin:6px 0 0">At least 10 characters.</p>' : ''}
<p style="margin-top:20px"><button class="btn" type="submit">${isSignup ? 'Create account' : 'Log in'}</button></p></form>
<p class="muted">${isSignup ? 'Already have an account? <a href="/login">Log in</a>' : 'New here? <a href="/signup">Create an account</a>'}</p></div>`,
  );
}

export interface RepoRow {
  id: string;
  full_name: string;
  never_claim: string;
  never_expose: string;
}
export interface SignalRow {
  id: string;
  repo_full_name: string;
  commit_sha: string;
  commit_url: string;
  channel: Channel;
  draft: string;
  decision: string;
  reasons: string;
  status: string;
  created_at: string;
}

function signalCard(s: SignalRow): string {
  const reasons: string[] = JSON.parse(s.reasons || '[]');
  const state = s.status === 'draft' ? s.decision : s.status;
  const editable = s.status === 'draft';
  return `<article class="card signal ${esc(state)}" data-signal="${esc(s.id)}">
<div class="meta"><span class="pill ${esc(state)}">${esc(state)}</span><span>${esc(CHANNEL_LABELS[s.channel] ?? s.channel)}</span><span>${esc(s.repo_full_name)}@${esc(s.commit_sha.slice(0, 7))}</span><span>${s.draft.length}/${CHANNEL_LIMITS[s.channel]}</span></div>
<pre id="d-${esc(s.id)}">${esc(s.draft)}</pre>
${reasons.length && s.decision === 'blocked' ? `<ul class="reasons">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
<div class="actions"><button class="btn ghost sm" type="button" data-copy="d-${esc(s.id)}">Copy</button>
<a class="btn ghost sm" href="${esc(s.commit_url)}" target="_blank" rel="noopener noreferrer">Proof</a>
${editable && s.decision !== 'blocked' ? `<form method="post" action="/app/signals/${esc(s.id)}/approve"><button class="btn sm" type="submit">Approve</button></form>` : ''}
${editable ? `<form method="post" action="/app/signals/${esc(s.id)}/reject"><button class="btn ghost sm" type="submit">Reject</button></form>` : ''}</div>
${editable ? `<details><summary>Edit draft</summary><form method="post" action="/app/signals/${esc(s.id)}/edit"><textarea name="draft" aria-label="Draft text">${esc(s.draft)}</textarea><p><button class="btn sm" type="submit">Save and re-check</button></p></form></details>` : ''}
</article>`;
}

export function dashboard(opts: {
  user: ViewUser;
  repos: RepoRow[];
  signals: SignalRow[];
  usedThisMonth: number;
  onWaitlist: boolean;
  filter: string;
  ok: string | null;
  err: string | null;
}): string {
  const { user, repos, signals, usedThisMonth, onWaitlist, filter } = opts;
  const p = user.plan;
  const pct = Math.min(100, Math.round((usedThisMonth / p.signalsPerMonth) * 100));
  const atRepoLimit = repos.length >= p.maxRepos;
  const filters = ['draft', 'approved', 'rejected', 'all']
    .map((f) => `<a href="/app?status=${f}" ${f === filter ? 'aria-current="page" style="color:var(--accent);font-weight:600"' : ''}>${f === 'draft' ? 'Queue' : f[0]!.toUpperCase() + f.slice(1)}</a>`)
    .join(' · ');
  return layout(
    'Dashboard · Signal Loop',
    `${flash('ok', opts.ok)}${flash('err', opts.err)}
<div class="dash"><aside class="stack">
<div class="card"><div class="meta"><span class="pill ${p.id === 'pro' ? 'approved' : 'review'}">${esc(p.name)} plan</span></div>
<p style="margin:12px 0 6px"><strong data-testid="usage">${usedThisMonth} / ${p.signalsPerMonth}</strong> <span class="muted">drafts this month</span></p><div class="meter"><span style="width:${pct}%"></span></div>
<p class="muted" style="font-size:13px">Channels: ${p.channels.map((c) => CHANNEL_LABELS[c]).join(', ')}</p></div>
<div class="card"><h3>Repos <span class="muted" style="font:14px var(--sans)">${repos.length}/${p.maxRepos}</span></h3>
${repos.map((r) => `<p style="margin:6px 0"><a href="/app/repos/${esc(r.id)}" class="mono">${esc(r.full_name)}</a></p>`).join('') || '<p class="muted">No repo connected yet.</p>'}
${atRepoLimit ? `<p class="muted" style="font-size:13px">Repo limit reached on ${esc(p.name)}.</p>` : `<form method="post" action="/app/repos"><label for="repo">Public GitHub repo</label><input id="repo" name="full_name" type="text" placeholder="owner/repo" required pattern="[A-Za-z0-9\\-]+/[A-Za-z0-9._\\-]+" title="owner/repo"><p><button class="btn sm" type="submit">Connect</button></p></form>`}</div>
${p.id === 'free' ? `<div class="card" id="upgrade"><h3>Pro · early access</h3><p class="muted" style="font-size:14px">25 repos, 1000 drafts, all 5 channels, autopilot when it ships.</p>${onWaitlist ? '<p><strong>You are on the list.</strong></p>' : '<form method="post" action="/app/upgrade"><button class="btn sm" type="submit">Join early access</button></form>'}</div>` : ''}
</aside>
<section><h2 class="section-title" style="margin-top:0">Signals</h2><p class="muted">${filters}</p>
<div class="stack">${signals.map(signalCard).join('') || `<div class="card"><p>No signals here yet.</p><p class="muted">${repos.length ? 'Open a repo and generate drafts from a commit.' : 'Connect a public repo to start.'}</p></div>`}</div></section></div>`,
    user,
  );
}

export function repoPage(opts: {
  user: ViewUser;
  repo: RepoRow;
  commits: Array<{ sha: string; url: string; message: string; author: string; date: string; score: number }>;
  githubError: string | null;
  showAll: boolean;
  ok: string | null;
  err: string | null;
}): string {
  const { user, repo, commits } = opts;
  const visible = opts.showAll ? commits : commits.filter((c) => c.score >= 30);
  const hidden = commits.length - visible.length;
  const nc: string[] = JSON.parse(repo.never_claim || '[]');
  const ne: string[] = JSON.parse(repo.never_expose || '[]');
  const boxes = user.plan.channels
    .map((c, i) => `<label class="chk"><input type="checkbox" name="channels" value="${c}" ${i < 2 ? 'checked' : ''}>${CHANNEL_LABELS[c]}</label>`)
    .join('');
  return layout(
    `${repo.full_name} · Signal Loop`,
    `<p style="margin-top:24px"><a href="/app">← Dashboard</a></p><h1 class="section-title mono" style="font-family:var(--mono);font-size:24px">${esc(repo.full_name)}</h1>
${flash('ok', opts.ok)}${flash('err', opts.err)}${flash('err', opts.githubError)}
<details class="card" style="margin:16px 0"><summary>Truth rules for this repo (${nc.length + ne.length})</summary>
<form method="post" action="/app/repos/${esc(repo.id)}/rules"><label for="nc">Never claim (one per line)</label><textarea id="nc" name="never_claim" placeholder="publicly launched">${esc(nc.join('\n'))}</textarea>
<label for="ne">Never expose (one per line)</label><textarea id="ne" name="never_expose" placeholder="customer names">${esc(ne.join('\n'))}</textarea><p><button class="btn sm" type="submit">Save rules</button></p></form>
<form method="post" action="/app/repos/${esc(repo.id)}/delete" data-confirm="Disconnect this repo and delete its signals?"><button class="btn ghost sm" type="submit">Disconnect repo</button></form></details>
<div class="card"><table><thead><tr><th>Commit</th><th>Signal</th><th>Generate drafts</th></tr></thead><tbody>
${visible.map((c) => `<tr data-sha="${esc(c.sha)}"><td><a class="mono" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.sha.slice(0, 7))}</a><div>${esc(c.message.split('\n')[0])}</div><div class="muted" style="font-size:12px">${esc(c.author)} · ${esc(c.date.slice(0, 10))}</div></td><td class="score">${c.score}</td>
<td><form method="post" action="/app/repos/${esc(repo.id)}/generate"><input type="hidden" name="sha" value="${esc(c.sha)}">${boxes}<button class="btn sm" type="submit">Draft</button></form></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No commits to show.</td></tr>'}
</tbody></table>${hidden > 0 ? `<p class="muted" style="font-size:13px">${hidden} low-signal commit${hidden > 1 ? 's' : ''} hidden (merges, dependency bumps). <a href="?all=1">Show all</a></p>` : ''}</div>`,
    user,
  );
}

export function notFound(user: ViewUser | null): string {
  return layout('Not found · Signal Loop', '<div class="auth"><h1>Not found</h1><p><a href="/">Go home</a></p></div>', user);
}

export function tooMany(): string {
  return layout('Slow down · Signal Loop', '<div class="auth"><h1>Too many attempts</h1><p class="muted">Wait 15 minutes, then try again.</p><p><a href="/login">Back to log in</a></p></div>');
}
